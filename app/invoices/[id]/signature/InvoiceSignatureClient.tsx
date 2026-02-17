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

      const safeBackUrl =
        s(backUrl) || `/invoices/${encodeURIComponent(inv)}`;

      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoice_id: inv,
          back_url: safeBackUrl,
        }),
        credentials: "include",
        cache: "no-store",
      });

      const raw = await r.text().catch(() => "");
      let j: any = {};

      try {
        j = raw ? JSON.parse(raw) : {};
      } catch {
        j = {};
      }

      if (!r.ok || !j?.ok || !j?.authorize_url) {
        const msg =
          s(j?.message) ||
          s(j?.error) ||
          raw ||
          `HTTP_${r.status}`;
        setErr(msg);
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
        {loading ? "Redirection…" : "Signer avec DigiGo"}
      </button>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 break-words">
          {err}
        </div>
      ) : null}
    </div>
  );
}
