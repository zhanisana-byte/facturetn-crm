"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}
function first(v: any) {
  return Array.isArray(v) ? s(v[0]) : s(v);
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function store(k: string, v: string) {
  const val = s(v);
  if (!val) return;
  try {
    window.localStorage.setItem(k, val);
  } catch {}
  try {
    window.sessionStorage.setItem(k, val);
  } catch {}
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
      const st = s(j?.state);
      const inv = s(j?.invoice_id || invoiceId);
      const back = s(j?.back_url || safeBackUrl);

      if (!url) throw new Error("AUTHORIZE_URL_MISSING");
      if (!isUuid(st)) throw new Error("BAD_STATE_FROM_START");
      if (!isUuid(inv)) throw new Error("BAD_INVOICE_ID_FROM_START");

      store("digigo_state", st);
      store("digigo_invoice_id", inv);
      store("digigo_back_url", back);

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
