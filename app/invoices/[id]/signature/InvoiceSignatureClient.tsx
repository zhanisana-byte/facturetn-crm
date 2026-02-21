"use client";

import { useCallback, useState } from "react";

type Props = {
  invoiceId: string;
  backUrl?: string;
};

export default function InvoiceSignatureClient({ invoiceId, backUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onStart = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, back_url: backUrl ?? null }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setError(String(data?.error || "START_FAILED"));
        return;
      }

      const url = String(data?.authorize_url || "");
      if (!url) {
        setError("MISSING_AUTHORIZE_URL");
        return;
      }

      window.location.href = url;
    } catch (e: any) {
      setError(String(e?.message || "NETWORK_ERROR"));
    } finally {
      setLoading(false);
    }
  }, [invoiceId, backUrl]);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onStart}
        disabled={loading}
        className="w-full rounded-full bg-black px-6 py-4 text-white shadow-sm transition disabled:opacity-60"
      >
        {loading ? "Chargement..." : "Signer avec DigiGo"}
      </button>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
