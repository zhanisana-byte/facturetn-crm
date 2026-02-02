"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  invoiceId: string;
};

type StartResponse =
  | { ok: true; need_identity: true }
  | { ok: true; need_pin: true }
  | { ok: true; otp_required: true; otp_id: string }
  | { ok: true }
  | { ok: false; error: string };

function s(v: any) {
  return String(v ?? "").trim();
}

export default function InvoiceSignatureClient({ invoiceId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"loading" | "identity" | "pin" | "otp" | "done">("loading");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationalId, setNationalId] = useState("");

  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [otpId, setOtpId] = useState("");

  const [loading, startTransition] = useTransition();

  const identityPayload = useMemo(() => {
    const p = s(phone);
    const e = s(email);
    const n = s(nationalId);
    const payload: any = {};
    if (p) payload.phone = p;
    if (e) payload.email = e;
    if (n) payload.national_id = n;
    return payload;
  }, [phone, email, nationalId]);

  async function markViewed() {
    await fetch(`/api/invoices/${invoiceId}/viewed`, { method: "POST" });
  }

  async function startDigigo(extra?: { pin?: string; identity?: any }) {
    const body: any = { invoice_id: invoiceId };
    if (extra?.pin) body.pin = extra.pin;
    if (extra?.identity) body.identity = extra.identity;

    const res = await fetch("/api/signature/digigo/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    let json: StartResponse = { ok: false, error: "Erreur signature" };
    try {
      json = (await res.json()) as StartResponse;
    } catch {
      json = { ok: false, error: "Erreur signature" };
    }

    if (!res.ok) {
      const err = s((json as any)?.error) || "Erreur signature";
      if (res.status === 409 && err === "MUST_VIEW_INVOICE") {
        await markViewed();
        const retry = await fetch("/api/signature/digigo/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const retryJson = (await retry.json().catch(() => ({ ok: false, error: "Erreur signature" }))) as StartResponse;
        if (!retry.ok) throw new Error(s((retryJson as any)?.error) || "Erreur signature");
        return retryJson;
      }
      throw new Error(err);
    }

    return json;
  }

  async function confirmDigigo() {
    const res = await fetch("/api/signature/digigo/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_id: invoiceId, otp_id: otpId, otp: s(otp) }),
    });

    const json = (await res.json().catch(() => ({ ok: false, error: "Erreur signature" }))) as any;
    if (!res.ok) throw new Error(s(json?.error) || "Erreur signature");
    return json;
  }

  async function runStart(extra?: { pin?: string; identity?: any }) {
    setError(null);
    setInfo(null);

    const r = await startDigigo(extra);

    if ((r as any).ok && (r as any).need_identity) {
      setStep("identity");
      return;
    }

    if ((r as any).ok && (r as any).need_pin) {
      setStep("pin");
      return;
    }

    if ((r as any).ok && (r as any).otp_required) {
      const id = s((r as any).otp_id);
      if (!id) throw new Error("otp_id manquant");
      setOtpId(id);
      setStep("otp");
      return;
    }

    setStep("done");
  }

  useEffect(() => {
    (async () => {
      try {
        await markViewed();
        await runStart();
      } catch (e: any) {
        setStep("identity");
        setError(s(e?.message) || "Erreur signature");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  function onSubmitIdentity() {
    startTransition(async () => {
      try {
        const p = s(phone);
        const e = s(email);
        if (!p && !e) {
          setError("Téléphone ou email requis");
          return;
        }
        await runStart({ identity: identityPayload });
      } catch (e: any) {
        setError(s(e?.message) || "Erreur signature");
      }
    });
  }

  function onSubmitPin() {
    startTransition(async () => {
      try {
        const v = s(pin);
        if (!v) {
          setError("Code PIN requis");
          return;
        }
        await runStart({ pin: v });
      } catch (e: any) {
        setError(s(e?.message) || "Erreur signature");
      }
    });
  }

  function onSubmitOtp() {
    startTransition(async () => {
      try {
        const v = s(otp);
        if (!v) {
          setError("OTP requis");
          return;
        }
        await confirmDigigo();
        setInfo("Facture signée");
        setStep("done");
        router.refresh();
        router.push(`/invoices/${invoiceId}`);
      } catch (e: any) {
        setError(s(e?.message) || "Erreur signature");
      }
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="ftn-card p-6 space-y-4">
        <div className="text-lg font-semibold">Signature DigiGo</div>
        <div className="text-sm text-slate-600">
          La signature se fait uniquement via DigiGo. La facture est verrouillée après signature.
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {info}
          </div>
        )}

        {step === "loading" && <div className="text-sm text-slate-700">Chargement...</div>}

        {step === "identity" && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Identité DigiGo</div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-600 mb-1">Téléphone</div>
                <input
                  className="ftn-input w-full"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+216..."
                />
              </div>

              <div>
                <div className="text-xs text-slate-600 mb-1">Email</div>
                <input
                  className="ftn-input w-full"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@domaine.tn"
                />
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-600 mb-1">Identifiant national (optionnel)</div>
              <input
                className="ftn-input w-full max-w-md"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
                placeholder="CIN / national_id"
              />
            </div>

            <div className="flex gap-2">
              <button className="ftn-btn" onClick={onSubmitIdentity} disabled={loading}>
                Continuer
              </button>
              <button
                className="ftn-btn ftn-btn-ghost"
                onClick={() => router.push(`/invoices/${invoiceId}`)}
                disabled={loading}
              >
                Retour
              </button>
            </div>
          </div>
        )}

        {step === "pin" && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Code PIN</div>
            <div className="text-sm text-slate-600">
              Entrez le code reçu (OTP d&apos;authentification) pour activer la session de signature.
            </div>

            <input
              className="ftn-input w-full max-w-sm"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN"
            />

            <div className="flex gap-2">
              <button className="ftn-btn" onClick={onSubmitPin} disabled={loading}>
                Valider
              </button>
              <button className="ftn-btn ftn-btn-ghost" onClick={() => runStart()} disabled={loading}>
                Renvoyer
              </button>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div className="space-y-3">
            <div className="text-sm font-medium">OTP de signature</div>
            <div className="text-sm text-slate-600">Entrez le code OTP pour finaliser la signature.</div>

            <input
              className="ftn-input w-full max-w-sm"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="OTP"
            />

            <div className="flex gap-2">
              <button className="ftn-btn" onClick={onSubmitOtp} disabled={loading}>
                Signer
              </button>
              <button className="ftn-btn ftn-btn-ghost" onClick={() => runStart({ pin: s(pin) })} disabled={loading}>
                Renvoyer OTP
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3">
            <div className="text-sm font-medium">Terminé</div>
            <div className="text-sm text-slate-600">Vous pouvez envoyer la facture vers TTN depuis le résumé.</div>
            <div className="flex gap-2">
              <button className="ftn-btn" onClick={() => router.push(`/invoices/${invoiceId}`)}>
                Retour au résumé
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
