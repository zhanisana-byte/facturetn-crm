"use client";

import { useState } from "react";

export default function InvoiceActions({
  invoiceId,
  companyId,
  canSendTTN,
  canValidate,
  canSubmitForValidation,
  validationRequired,
  status,
  validatedAt,
  ttnStatus,
  ttnScheduledAt,
}: {
  invoiceId: string;
  companyId?: string;
  canSendTTN: boolean;
  canValidate: boolean;
  canSubmitForValidation: boolean;
  validationRequired: boolean;
  status: string;
  validatedAt: string | null;
  ttnStatus: string;
  ttnScheduledAt: string | null;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState<string>(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
      d.getHours()
    )}:${pad(d.getMinutes())}`;
  });

  async function download(url: string, label: string, fallbackName: string) {
    try {
      setLoading(label);
      const res = await fetch(url, { method: "GET" });

      const ct = res.headers.get("content-type") || "";
      if (!res.ok || ct.includes("application/json")) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || `Erreur: ${label}`);
        return;
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="?([^\"]+)"?/i);
      const filename = match?.[1] || fallbackName;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      alert(e?.message || "Erreur réseau");
    } finally {
      setLoading(null);
    }
  }

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

  async function callWithBody(url: string, label: string, body: any) {
    try {
      setLoading(label);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
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

  const pdfUrl = `/api/invoices/${invoiceId}/pdf`;
  const xmlUrl = `/api/invoices/${invoiceId}/xml`;
  const emailUrl = `/invoices/${invoiceId}/send`;
  const isScheduled = ttnStatus === "scheduled";
  const st = String(status || "draft");
  const showSubmitForValidation = validationRequired && !validatedAt && st === "draft";
  const showValidate = validationRequired && !validatedAt && st === "pending_validation";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">Actions</h2>
      <p className="text-sm text-slate-600 mt-1">PDF/XML/Email disponibles après enregistrement.</p>

      <div className="mt-4 flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={loading !== null}
          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
          onClick={() => download(pdfUrl, "Téléchargement PDF", `facture-${invoiceId}.pdf`)}
        >
          {loading === "Téléchargement PDF" ? "Téléchargement..." : "Télécharger PDF"}
        </button>

        <button
          type="button"
          disabled={loading !== null}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
          onClick={() => download(xmlUrl, "Téléchargement XML", `facture-${invoiceId}.xml`)}
        >
          {loading === "Téléchargement XML" ? "Téléchargement..." : "Télécharger TEIF (XML)"}
        </button>

        <a href={emailUrl} className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50">
          Envoyer par email
        </a>

        {companyId ? (
          <a
            href={`/companies/${companyId}/ttn`}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
            title="Paramètres TTN de la société"
          >
            Paramètres TTN
          </a>
        ) : null}

        {showSubmitForValidation && (
          <button
            disabled={!canSubmitForValidation || loading !== null}
            className={`px-4 py-2 rounded-xl text-sm disabled:opacity-60 ${
              canSubmitForValidation
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "bg-slate-200 text-slate-500"
            }`}
            onClick={() => call(`/api/invoices/${invoiceId}/submit`, "Soumission")}
            title={!canSubmitForValidation ? "Accès refusé" : "Soumettre pour validation"}
          >
            {loading === "Soumission" ? "Soumission..." : "Soumettre pour validation"}
          </button>
        )}

        {showValidate && (
          <button
            disabled={!canValidate || loading !== null}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-60"
            onClick={() => call(`/api/invoices/${invoiceId}/validate`, "Validation")}
          >
            {loading === "Validation" ? "Validation..." : "Valider (Comptable)"}
          </button>
        )}

        <button
          disabled={!canSendTTN || loading !== null || isScheduled}
          className={`px-4 py-2 rounded-xl text-sm disabled:opacity-60 ${
            canSendTTN ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-200 text-slate-500"
          }`}
          onClick={() => call(`/api/invoices/${invoiceId}/ttn`, "TTN")}
          title={
            !canSendTTN
              ? validationRequired
                ? "Validation requise avant envoi"
                : "Accès refusé ou facture non prête"
              : isScheduled
              ? "Déjà programmé"
              : "Envoyer TTN"
          }
        >
          {loading === "TTN" ? "Envoi TTN..." : "Envoyer TTN"}
        </button>

        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm"
            disabled={!canSendTTN || loading !== null || isScheduled}
          />
          <button
            disabled={!canSendTTN || loading !== null || isScheduled}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-60"
            onClick={() =>
              callWithBody(`/api/invoices/${invoiceId}/ttn/schedule`, "Programmer TTN", {
                scheduled_at: scheduleAt,
              })
            }
          >
            {loading === "Programmer TTN" ? "Programmation..." : "Programmer"}
          </button>
        </div>

        {isScheduled && (
          <button
            disabled={loading !== null}
            className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm hover:bg-amber-700 disabled:opacity-60"
            onClick={() => call(`/api/invoices/${invoiceId}/ttn/cancel`, "Annuler TTN")}
          >
            {loading === "Annuler TTN" ? "Annulation..." : "Annuler TTN"}
          </button>
        )}

        <button
          disabled={loading !== null}
          className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm hover:bg-red-700 disabled:opacity-60"
          onClick={() => {
            if (confirm("Supprimer cette facture ?")) call(`/api/invoices/${invoiceId}/delete`, "Suppression");
          }}
        >
          {loading === "Suppression" ? "Suppression..." : "Supprimer"}
        </button>
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Si tu as une erreur, le message affiché te dira si c'est un 401 (non connecté) ou 404 (accès refusé).
      </div>
    </div>
  );
}
