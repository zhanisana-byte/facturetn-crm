"use client";

import { useCallback, useState } from "react";

type Props = {
  invoiceId: string;
  backUrl?: string;
};

export default function InvoiceSignatureClient({ invoiceId, backUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const start = useCallback(async () => {
    if (loading) return;

    setErr("");
    setLoading(true);

    try {
      const res = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoiceId, backUrl: backUrl ?? null }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        const msg = String(data?.details || data?.message || data?.error || "START_FAILED");
        setErr(msg);
        return;
      }

      const url = String(data.authorize_url || "");
      if (!url) {
        setErr("MISSING_AUTHORIZE_URL");
        return;
      }

      window.location.href = url;
    } catch (e: any) {
      setErr(String(e?.message || "START_ERROR"));
    } finally {
      setLoading(false);
    }
  }, [invoiceId, backUrl, loading]);

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button className="ftn-btn" type="button" onClick={start} disabled={loading}>
        {loading ? "Connexion DigiGo..." : "Signer avec DigiGo"}
      </button>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
          {err}
        </div>
      ) : null}
    </div>
  );
}
