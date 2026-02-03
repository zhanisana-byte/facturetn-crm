"use client";

import { useEffect, useMemo, useState } from "react";

type Step = "start" | "pin" | "otp" | "done" | "error";

function s(v: any) {
  return String(v ?? "").trim();
}

function mapError(code: string) {
  const c = s(code).toUpperCase();
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
  return code || "Erreur DigiGo.";
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

  async function start() {
    setMsg(null);
    setLoading(true);
    setStep("start");
    try {
      const r = await fetch("/api/signature/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
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
      setStep("pin");
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
      setStep("error");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPin() {
    setMsg(null);
    setLoading(true);
    try {
      const r = await fetch("/api/signature/digigo/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, pin: s(pin) }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        const raw = s(j?.error || j?.message || "PIN_INVALID");
        setMsg({ ok: false, text: mapError(raw) });
        return;
      }

      setStep("otp");
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
    } finally {
      setLoading(false);
    }
  }

  async function confirmOtp() {
    setMsg(null);
    setLoading(true);
    try {
      const r = await fetch("/api/signature/digigo/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, otp: s(otp) }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        const raw = s(j?.error || j?.message || "OTP_INVALID");
        setMsg({ ok: false, text: mapError(raw) });
        return;
      }

      setStep("done");
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    start();
  }, []);

  return (
    <div className="ftn-card p-6">
      <div className="text-sm text-[var(--muted)]">
        La signature se fait uniquement via DigiGo. La facture sera verrouillée après signature.
      </div>

      {msg ? (
        <div
          className={`mt-4 rounded-xl border p-3 text-sm ${
            msg.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      {step === "start" ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="ftn-btn" disabled>
            Initialisation...
          </button>
          <a className="ftn-btn ftn-btn-ghost" href={backUrl}>
            Retour
          </a>
        </div>
      ) : null}

      {step === "pin" ? (
        <div className="mt-6 space-y-3">
          <div className="text-sm font-medium">PIN DigiGo</div>
          <input
            className="ftn-input"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Votre PIN DigiGo"
            type="password"
          />
          <div className="flex flex-wrap gap-3">
            <button className="ftn-btn" onClick={confirmPin} disabled={loading || !canContinuePin}>
              {loading ? "Validation..." : "Continuer"}
            </button>
            <button className="ftn-btn ftn-btn-ghost" onClick={start} disabled={loading}>
              Renvoyer OTP
            </button>
            <a className="ftn-btn ftn-btn-ghost" href={backUrl}>
              Retour
            </a>
          </div>
        </div>
      ) : null}

      {step === "otp" ? (
        <div className="mt-6 space-y-3">
          <div className="text-sm font-medium">Code OTP</div>
          <input
            className="ftn-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Code reçu par SMS / Email"
            inputMode="numeric"
          />
          <div className="flex flex-wrap gap-3">
            <button className="ftn-btn" onClick={confirmOtp} disabled={loading || !canContinueOtp}>
              {loading ? "Signature..." : "Signer"}
            </button>
            <button className="ftn-btn ftn-btn-ghost" onClick={start} disabled={loading}>
              Renvoyer OTP
            </button>
            <a className="ftn-btn ftn-btn-ghost" href={backUrl}>
              Retour
            </a>
          </div>
        </div>
      ) : null}

      {step === "done" ? (
        <div className="mt-6 space-y-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
            Signature réussie. La facture est maintenant verrouillée.
          </div>
          <a className="ftn-btn" href={backUrl}>
            Retour à la facture
          </a>
        </div>
      ) : null}

      {step === "error" ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <a className="ftn-btn" href={backUrl}>
            Retour
          </a>
          <a className="ftn-btn ftn-btn-ghost" href="/ttn">
            Paramètres TTN
          </a>
        </div>
      ) : null}
    </div>
  );
}
