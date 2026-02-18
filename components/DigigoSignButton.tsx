"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function DigigoSignButton(props: { invoiceId: string; backUrl?: string }) {
  const invoiceId = s(props.invoiceId);
  const backUrl = s(props.backUrl || "");

  const [loading, setLoading] = useState(false);

  function setEverywhere(key: string, value: string) {
    const v = s(value);
    if (!v) return;
    try {
      window.localStorage.setItem(key, v);
    } catch {}
    try {
      window.sessionStorage.setItem(key, v);
    } catch {}
  }

  function clearEverywhere(keys: string[]) {
    for (const k of keys) {
      try {
        window.localStorage.removeItem(k);
      } catch {}
      try {
        window.sessionStorage.removeItem(k);
      } catch {}
    }
  }

  async function handleClick() {
    if (!invoiceId) {
      alert("invoiceId manquant");
      return;
    }

    setLoading(true);
    try {
      clearEverywhere(["digigo_state", "digigo_invoice_id", "digigo_back_url"]);

      const safeBackUrl = backUrl || `/invoices/${encodeURIComponent(invoiceId)}`;

      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, back_url: safeBackUrl }),
        cache: "no-store",
        credentials: "include",
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(s(j?.details || j?.error || `HTTP_${r.status}`));

      const url = s(j?.authorize_url || "");
      const state = s(j?.state || "");
      if (!url) throw new Error("AUTHORIZE_URL_MISSING");
      if (!state) throw new Error("STATE_MISSING");

      setEverywhere("digigo_invoice_id", invoiceId);
      setEverywhere("digigo_state", state);
      setEverywhere("digigo_back_url", safeBackUrl);

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
