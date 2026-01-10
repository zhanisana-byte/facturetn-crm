"use client";

import { useState } from "react";

export default function InvoiceActions({
  invoiceId,
  canSendTTN,
  needsValidation,
}: {
  invoiceId: string;
  canSendTTN: boolean;
  needsValidation: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function call(url: string, label: string) {
    try {
      setLoading(label);
      const res = await fetch(url, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        alert(data?.error || `Erreur: ${label}`);
        return;
      }
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
    } finally {
      setLoading(null);
    }
  }

  // ✅ liens ABSOLUS : évite bugs basePath / rewrites
  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;
  const xmlUrl = `/api/invoices/${invoiceId}/xml`;
  const emailUrl = `/invoices/${invoiceId}/send`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Actions</h2>
      <p className="text-sm text-slate-600 mt-1">
        PDF/XML/Email disponibles après enregistrement.
      </p>

      <div className="mt-4 flex gap-2 flex-wrap">
        {/* ✅ PDF */}
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800"
        >
          Télécharger PDF
        </a>

        {/* ✅ XML */}
        <a
          href={xmlUrl}
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
        >
          Télécharger XML
        </a>

        {/* ✅ Email */}
        <a
          href={emailUrl}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
        >
          Envoyer par email
        </a>

        {/* Validation (placeholder) */}
        {needsValidation && (
          <button
            disabled={loading !== null}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
            onClick={() => call(`/api/invoices/${invoiceId}/validate`, "Validation")}
          >
            {loading === "Validation" ? "Validation..." : "Valider (Comptable)"}
          </button>
        )}

        {/* TTN (placeholder) */}
        <button
          disabled={!canSendTTN || loading !== null}
          className={`px-4 py-2 rounded-xl text-sm disabled:opacity-60 ${
            canSendTTN
              ? "bg-indigo-600 text-white hover:bg-indigo-700"
              : "bg-slate-200 text-slate-500"
          }`}
          title={!canSendTTN ? "Valider la facture avant envoi TTN" : "Envoyer à TTN"}
          onClick={() => call(`/api/invoices/${invoiceId}/ttn`, "TTN")}
        >
          {loading === "TTN" ? "Envoi TTN..." : "Envoyer TTN"}
        </button>

        {/* Delete */}
        <button
          disabled={loading !== null}
          className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
          onClick={() => {
            if (confirm("Supprimer cette facture ?")) {
              call(`/api/invoices/${invoiceId}/delete`, "Suppression");
            }
          }}
        >
          {loading === "Suppression" ? "Suppression..." : "Supprimer"}
        </button>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Si PDF/XML donne 404 ➜ ça veut dire que les routes API ne sont pas créées (ou pas au bon chemin).
      </div>
    </div>
  );
}
