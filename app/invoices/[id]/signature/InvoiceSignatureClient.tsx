"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Step = "idle" | "starting" | "redirecting" | "confirming" | "done" | "error";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function InvoiceSignatureClient({
  invoiceId,
  backUrl,
  environment,
}: {
  invoiceId: string;
  backUrl?: string;
  environment?: "test" | "production";
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string>("");

  const urlCode = useMemo(() => s(sp.get("code")), [sp]);
  const urlState = useMemo(() => s(sp.get("state")), [sp]);
  const urlToken = useMemo(() => s(sp.get("token")), [sp]); // si DigiGo renvoie token (selon flux)
  const isReturningFromDigigo = useMemo(() => !!urlCode && !!urlState, [urlCode, urlState]);

  async function start() {
    setError("");
    setStep("starting");

    try {
      const res = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          environment: environment || undefined,
        }),
      });

      const j = await res.json().catch(() => null);

      if (!res.ok || !j?.ok) {
        const msg = s(j?.message || j?.error || "UNKNOWN_ERROR");
        setError(msg);
        setStep("error");
        return;
      }

      const authorizeUrl = s(j?.authorize_url);
      if (!authorizeUrl) {
        setError("authorize_url manquant");
        setStep("error");
        return;
      }

      setStep("redirecting");
      window.location.href = authorizeUrl;
    } catch (e: any) {
      setError(s(e?.message || "UNKNOWN_ERROR"));
      setStep("error");
    }
  }

  async function confirm() {
    setError("");
    setStep("confirming");

    try {
      const res = await fetch("/api/digigo/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId,
          code: urlCode,
          state: urlState,
          token: urlToken || undefined,
        }),
      });

      const j = await res.json().catch(() => null);

      if (!res.ok || !j?.ok) {
        const msg = s(j?.message || j?.error || "UNKNOWN_ERROR");
        setError(msg);
        setStep("error");
        return;
      }

      setStep("done");

      if (backUrl) {
        router.replace(backUrl);
      } else {
        router.replace(`/invoices/${invoiceId}`);
      }
    } catch (e: any) {
      setError(s(e?.message || "UNKNOWN_ERROR"));
      setStep("error");
    }
  }

  useEffect(() => {
    if (isReturningFromDigigo) {
      confirm();
      return;
    }
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId, isReturningFromDigigo]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-lg font-semibold text-slate-900">Signature DigiGo</div>
      <div className="mt-1 text-sm text-slate-600">Vous allez être redirigé pour signer le hash TEIF.</div>

      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
        Invoice: <span className="font-mono">{invoiceId}</span>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {step === "idle" && "Prêt."}
        {step === "starting" && "Initialisation…"}
        {step === "redirecting" && "Redirection vers DigiGo…"}
        {step === "confirming" && "Confirmation de signature…"}
        {step === "done" && "Signature confirmée."}
        {step === "error" && <span className="text-red-700">{error || "UNKNOWN_ERROR"}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          onClick={() => start()}
        >
          Relancer
        </button>

        <button
          type="button"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          onClick={() => router.push(backUrl || `/invoices/${invoiceId}`)}
        >
          Retour
        </button>
      </div>
    </div>
  );
}
