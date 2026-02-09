"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function DigigoSignButton(props: { invoiceId: string; backUrl?: string }) {
  const invoiceId = s(props.invoiceId);
  const backUrl = s(props.backUrl || "");

  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!invoiceId) {
      alert("invoiceId manquant");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, back_url: backUrl }),
        cache: "no-store",
        credentials: "include",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(s(j?.details || j?.error || `HTTP_${r.status}`));

      const url = s(j?.authorize_url || "");
      if (!url) throw new Error("AUTHORIZE_URL_MISSING");

      window.location.href = url;
    } catch (e: any) {
      alert(s(e?.message || e || "Erreur"));
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-slate-900 text-white disabled:opacity-60"
    >
      {loading ? "Redirection…" : "Signer avec DigiGo"}
    </button>
  );
}
