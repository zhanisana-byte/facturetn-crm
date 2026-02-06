"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Step = "start" | "pin" | "otp" | "done" | "error";

function s(v: any) {
  return String(v ?? "").trim();
}

function mapError(codeOrMessage: string) {
  const raw = s(codeOrMessage);

  const looksLikeCode = raw.length <= 40 && /^[A-Z0-9_]+$/.test(raw.replaceAll(" ", "_"));
  if (!looksLikeCode) return raw || "Erreur DigiGo.";

  const c = raw.toUpperCase();
  if (c === "TTN_NOT_CONFIGURED") {
    return "TTN n’est pas configuré pour cette entité. Ouvrez Paramètres TTN et configurez le mode d’envoi et la signature.";
  }
  if (c === "IDENTITY_MISSING" || c === "NEED_IDENTITY") {
    return "Identité DigiGo non configurée. Allez dans Paramètres TTN > Signature DigiGo et enregistrez votre téléphone ou email.";
  }
  if (c === "UNAUTHORIZED") return "Session expirée. Reconnectez-vous.";
  if (c === "INVOICE_NOT_FOUND") return "Facture introuvable.";
  if (c === "PIN_INVALID") return "PIN invalide.";
  if (c === "OTP_INVALID") return "OTP invalide.";
  return raw || "Erreur DigiGo.";
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">
      {children}
    </span>
  );
}

export default function InvoiceSignatureClient({
  invoiceId,
  backUrl,
}: {
  invoiceId: string;
  backUrl: string;
}) {
  const [step, setStep] = useState<Step>("start");
  const [loading, setLoading] = useState(false);

  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [otpId, setOtpId] = useState<string | null>(null);

  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const canContinuePin = useMemo(() => s(pin).length >= 4, [pin]);
  const canContinueOtp = useMemo(() => s(otp).length >= 4 && !!otpId, [otp, otpId]);

  const startedOnce = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  function stopPending() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function start() {
    stopPending();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setMsg(null);
    setLoading(true);
    setStep("start");

    try {
      const r = await fetch("/api/signature/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
        signal: ctrl.signal,
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        const raw = s(j?.error || j?.message || "");
        const normalized = j?.need_identity ? "IDENTITY_MISSING" : raw;
        setMsg({ ok: false, text: mapError(normalized) });
        setStep("error");
        return;
      }

      setOtpId(s(j.otp_id || ""));
      setPin("");
      setOtp("");
      setStep("pin");
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPin() {
    stopPending();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setMsg(null);
    setLoading(true);

    try {
      const r = await fetch("/api/signature/digigo/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, pin: s(pin) }),
        signal: ctrl.signal,
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        const raw = s(j?.error || j?.message || "PIN_INVALID");
        setMsg({ ok: false, text: mapError(raw) });
        setStep("pin");
        return;
      }

      setStep("otp");
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
      setStep("pin");
    } finally {
      setLoading(false);
    }
  }

  async function confirmOtp() {
    stopPending();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setMsg(null);
    setLoading(true);

    try {
      const r = await fetch("/api/signature/digigo/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, otp: s(otp) }),
        signal: ctrl.signal,
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        const raw = s(j?.error || j?.message || "OTP_INVALID");
        setMsg({ ok: false, text: mapError(raw) });
        setStep("otp");
        return;
      }

      setMsg({ ok: true, text: "Signature réussie. La facture est maintenant verrouillée." });
      setStep("done");
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
      setStep("otp");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startedOnce.current) return;
    startedOnce.current = true;
    start();
    return () => stopPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title =
    step === "pin"
      ? "Saisir le PIN DigiGo"
      : step === "otp"
      ? "Saisir le code OTP"
      : step === "done"
      ? "Signature terminée"
      : step === "error"
      ? "Impossible de signer"
      : "Initialisation DigiGo";

  return (
    <div className="rounded-2xl border bg-white/70 p-5 sm:p-6 shadow">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg sm:text-xl font-semibold">{title}</div>
          <div className="mt-1 text-sm text-slate-600">
            Signature via DigiGo. Après signature, la facture sera verrouillée.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Pill>Facture: {invoiceId.slice(0, 8)}…</Pill>
            <Pill>Mode: DigiGo</Pill>
            {otpId ? <Pill>OTP prêt</Pill> : null}
          </div>
        </div>

        <a className="ftn-btn-ghost" href={backUrl}>
          Retour
        </a>
      </div>

      {msg ? (
        <div
          className={`mt-5 rounded-xl border p-3 text-sm ${
            msg.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="mt-5">
        <div className="h-2 w-full bg-slate-200 rounded overflow-hidden">
          <div
            className={`h-full transition-all ${
              step === "start"
                ? "w-1/4"
                : step === "pin"
                ? "w-2/4"
                : step === "otp"
                ? "w-3/4"
                : "w-full"
            } bg-slate-800`}
          />
        </div>
        <div className="mt-2 text-xs text-slate-500">Étapes : Initialisation → PIN → OTP → Signature</div>
      </div>

      {step === "start" ? (
        <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <button className="ftn-btn" disabled>
            Initialisation...
          </button>
          <button className="ftn-btn ftn-btn-ghost" onClick={start} disabled={loading} type="button">
            Relancer
          </button>
        </div>
      ) : null}

      {step === "pin" ? (
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-900">PIN DigiGo</div>
            <div className="text-xs text-slate-500 mt-1">
              Entrez votre PIN DigiGo pour valider l’envoi de l’OTP.
            </div>

            <input
              className="ftn-input mt-3"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Votre PIN DigiGo"
              type="password"
              autoComplete="one-time-code"
            />

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <button className="ftn-btn" onClick={confirmPin} disabled={loading || !canContinuePin} type="button">
                {loading ? "Validation..." : "Continuer"}
              </button>
              <button className="ftn-btn ftn-btn-ghost" onClick={start} disabled={loading} type="button">
                Renvoyer OTP
              </button>
              <a className="ftn-btn ftn-btn-ghost" href="/ttn">
                Paramètres TTN
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {step === "otp" ? (
        <div className="mt-6 grid gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-medium text-slate-900">Code OTP</div>
            <div className="text-xs text-slate-500 mt-1">Saisissez le code reçu par SMS / Email.</div>

            <input
              className="ftn-input mt-3"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Code OTP"
              inputMode="numeric"
              autoComplete="one-time-code"
            />

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <button className="ftn-btn" onClick={confirmOtp} disabled={loading || !canContinueOtp} type="button">
                {loading ? "Signature..." : "Signer"}
              </button>
              <button className="ftn-btn ftn-btn-ghost" onClick={start} disabled={loading} type="button">
                Renvoyer OTP
              </button>
              <a className="ftn-btn ftn-btn-ghost" href="/ttn">
                Paramètres TTN
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Signature réussie. La facture est maintenant verrouillée.
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <a className="ftn-btn" href={backUrl}>
              Retour à la facture
            </a>
            <a className="ftn-btn ftn-btn-ghost" href="/invoices">
              Liste des factures
            </a>
          </div>
        </div>
      ) : null}

      {step === "error" ? (
        <div className="mt-6 space-y-3">
          <div className="text-xs text-slate-500">
            Astuce : si l’erreur mentionne un champ manquant (adresse, MF…), complétez les informations puis relancez.
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button className="ftn-btn" onClick={start} disabled={loading} type="button">
              Réessayer
            </button>
            <a className="ftn-btn ftn-btn-ghost" href={backUrl}>
              Retour
            </a>
            <a className="ftn-btn ftn-btn-ghost" href="/ttn">
              Paramètres TTN
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
