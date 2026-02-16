"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function InvoiceSignatureClient() {
  const params = useParams<{ id: string }>();
  const invoiceId = s(params?.id);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setErr("");
    setLoading(true);

    if (!invoiceId) {
      setErr("ID facture manquant.");
      setLoading(false);
      return;
    }

    try {
      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          back_url: `/invoices/${invoiceId}`,
        }),
        credentials: "include",
        cache: "no-store",
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok) {
        setErr(
          typeof j === "object"
            ? JSON.stringify(j)
            : String(j)
        );
        return;
      }

      if (!j?.authorize_url) {
        setErr("authorize_url manquant");
        return;
      }

      window.location.href = j.authorize_url;
    } catch (e: any) {
      setErr(String(e?.message || "Erreur inattendue"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="ftn-btn w-full sm:w-auto"
        onClick={start}
        disabled={loading}
      >
        {loading ? "Redirection…" : "Signer avec DigiGo"}
      </button>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 break-words">
          {err}
        </div>
      )}
    </div>
  );
}
