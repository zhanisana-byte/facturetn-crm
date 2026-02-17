"use client";

import { useCallback, useState } from "react";

type Props = {
  invoiceId: string;
  environment?: "test" | "production";
};

function s(v: any) {
  return String(v ?? "").trim();
}

export default function InvoiceSignatureClient({ invoiceId, environment = "production" }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const start = useCallback(async () => {
    if (loading) return;

    setErr("");
    setLoading(true);

    try {
      const res = await fetch("/api/signature/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, environment }),
      });

      const j = await res.json().catch(() => ({}));

      if (!res.ok || !j?.ok) {
        setErr(s(j?.error || j?.message || "START_FAILED"));
        setLoading(false);
        return;
      }

      const url = s(j?.authorize_url);
      if (!url) {
        setErr("AUTHORIZE_URL_MISSING");
        setLoading(false);
        return;
      }

      window.location.href = url;
    } catch (e: any) {
      setErr(s(e?.message || "UNKNOWN_ERROR"));
      setLoading(false);
    }
  }, [invoiceId, environment, loading]);

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button className="ftn-btn" type="button" onClick={start} disabled={loading}>
        {loading ? "..." : "Démarrer la signature DigiGo"}
      </button>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}
    </div>
  );
}
