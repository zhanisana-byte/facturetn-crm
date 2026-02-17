"use client";

import { useState } from "react";

type Props = {
  invoiceId: string;
  backUrl?: string;
};

export default function InvoiceSignatureClient({ invoiceId, backUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    if (loading) return;

    setErr("");
    setLoading(true);

    try {
      const r = await fetch("/api/signature/digigo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          back_url: backUrl || `/invoices/${invoiceId}`,
        }),
      });

      const j = await r.json();

      if (!r.ok) {
        setErr(j?.error || "START_FAILED");
        setLoading(false);
        return;
      }

      const state = j?.state;
      const authorizeUrl = j?.authorize_url;

      if (!state || !authorizeUrl) {
        setErr("START_RESPONSE_INVALID");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("digigo_state", String(state));
      sessionStorage.setItem("digigo_invoice_id", String(invoiceId));
      sessionStorage.setItem("digigo_back_url", String(backUrl || `/invoices/${invoiceId}`));

      window.location.href = authorizeUrl;
    } catch (e: any) {
      setErr(String(e?.message || e));
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button className="ftn-btn" type="button" onClick={start} disabled={loading}>
        {loading ? "Démarrage..." : "Démarrer la signature DigiGo"}
      </button>
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}
    </div>
  );
}
