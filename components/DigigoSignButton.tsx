"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}
function first(v: any) {
  return Array.isArray(v) ? s(v[0]) : s(v);
}

export default function DigigoSignButton(props: { invoiceId: any; backUrl?: any }) {
  const invoiceId = first(props.invoiceId);
  const backUrl = first(props.backUrl);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleClick() {
    setErr("");
    if (!invoiceId) {
      setErr("MISSING_INVOICE_ID");
      return;
    }

    setLoading(true);
    try {
      const safeBackUrl = backUrl || `/invoices/${encodeURIComponent(invoiceId)}`;

      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          invoice_id: invoiceId,
          back_url: safeBackUrl,
        }),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        throw new Error(s(j?.error || j?.details || `HTTP_${r.status}`));
      }

      const url = s(j?.authorize_url);
      if (!url) throw new Error("AUTHORIZE_URL_MISSING");

      window.location.href = url;
    } catch (e: any) {
      setErr(s(e?.message || e));
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-slate-900 text-white disabled:opacity-60"
      >
        {loading ? "Redirection…" : "Signer avec DigiGo"}
      </button>

      {err ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">
          {err}
        </div>
      ) : null}
    </div>
  );
}
