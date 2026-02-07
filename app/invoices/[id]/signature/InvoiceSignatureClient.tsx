"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function InvoiceSignatureClient({
  invoiceId,
  backUrl,
}: {
  invoiceId: string;
  backUrl?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const resolvedBack = useMemo(() => {
    const b = s(sp.get("back"));
    return b || s(backUrl) || "/invoices";
  }, [sp, backUrl]);

  const invoiceLabel = useMemo(() => s(invoiceId), [invoiceId]);

  async function start() {
    setLoading(true);
    setErrorText("");

    try {
      const res = await fetch("/api/signature/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        const msg = s(data?.message) || s(data?.error) || "UNKNOWN_ERROR";
        setErrorText(msg);
        setLoading(false);
        return;
      }

      const url = s(data?.authorize_url);
      if (!url) {
        setErrorText("authorize_url manquant");
        setLoading(false);
        return;
      }

      window.location.href = url;
    } catch (e: any) {
      setErrorText(s(e?.message) || "UNKNOWN_ERROR");
      setLoading(false);
    }
  }

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  return (
    <div className="rounded-2xl border bg-white p-5">
      <div className="mb-3">
        <div className="text-lg font-semibold">Signature DigiGo</div>
        <div className="text-sm text-slate-600">
          Vous allez être redirigé pour signer le hash TEIF.
        </div>
      </div>

      <div className="mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs text-slate-700">
        Invoice: {invoiceLabel}
      </div>

      <div className="rounded-xl border bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {loading ? "Initialisation..." : "Prêt."}
      </div>

      {errorText ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorText}
        </div>
      ) : null}

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={start}
          disabled={loading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Relancer
        </button>

        <button
          type="button"
          onClick={() => router.push(resolvedBack)}
          className="rounded-xl border px-4 py-2 text-sm font-semibold"
        >
          Retour
        </button>
      </div>
    </div>
  );
}
