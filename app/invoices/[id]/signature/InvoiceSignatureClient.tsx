"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

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
      const inv = s(invoiceId);
      if (!inv) {
        setErr("INVOICE_ID_MISSING");
        return;
      }

      const safeBackUrl = s(backUrl) || `/invoices/${encodeURIComponent(inv)}`;

      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "cache-control": "no-store",
        },
        body: JSON.stringify({ invoice_id: inv, back_url: safeBackUrl }),
        credentials: "include",
        cache: "no-store",
        redirect: "manual",
      });

      const location = r.headers.get("location") || "";
      const ct = r.headers.get("content-type") || "";

      const raw = await r.text().catch(() => "");

      if (r.status >= 300 && r.status < 400) {
        setErr(`REDIRECT_${r.status} -> ${location || "NO_LOCATION"}`);
        return;
      }

      if (!ct.toLowerCase().includes("application/json")) {
        setErr(`NOT_JSON_${r.status} ct=${ct || "none"} body=${raw.slice(0, 180)}...`);
        return;
      }

      let j: any = {};
      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        j = {};
      }

      if (!r.ok || !j?.ok || !j?.authorize_url) {
        setErr(s(j?.message) || s(j?.error) || `HTTP_${r.status}`);
        return;
      }

      const authorizeUrl = s(j.authorize_url);
      if (!authorizeUrl) {
        setErr("AUTHORIZE_URL_MISSING");
        return;
      }

      window.location.href = authorizeUrl;
    } catch (e: any) {
      setErr(s(e?.message || "NETWORK_ERROR"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="ftn-btn w-full sm:w-auto"
      >
        {loading ? "Redirection…" : "Démarrer la signature DigiGo"}
      </button>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 break-words">
          {err}
        </div>
      ) : null}
    </div>
  );
}
