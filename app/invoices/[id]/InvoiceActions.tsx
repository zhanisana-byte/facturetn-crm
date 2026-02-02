"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function fmtDateTimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function nowLocalDefault() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 5);
  return fmtDateTimeLocal(d.toISOString());
}

export default function InvoiceActions({
  invoiceId,
  companyId,
  documentType,
  canSendTTN,
  canValidate,
  canSubmitForValidation,
  validationRequired,
  status,
  validatedAt,
  ttnStatus,
  ttnScheduledAt,
  ttnSendMode,
  signatureProvider,
  signatureRequired,
  invoiceSigned,
  signaturePending,
  digigoTransactionId,
  digigoOtpId,
  viewedBeforeSignatureAt,
}: {
  invoiceId: string;
  companyId?: string;
  documentType: string;
  canSendTTN: boolean;
  canValidate: boolean;
  canSubmitForValidation: boolean;
  validationRequired: boolean;
  status: string;
  validatedAt: string | null;
  ttnStatus: string;
  ttnScheduledAt: string | null;
  ttnSendMode: "api" | "manual";
  signatureProvider: string;
  signatureRequired: boolean;
  invoiceSigned: boolean;
  signaturePending: boolean;
  digigoTransactionId: string;
  digigoOtpId: string;
  viewedBeforeSignatureAt: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isDevis = useMemo(() => String(documentType).toLowerCase() === "devis", [documentType]);
  const isNotSent = useMemo(() => String(ttnStatus) === "not_sent", [ttnStatus]);

  const needsValidation = useMemo(() => Boolean(validationRequired) && !validatedAt, [validationRequired, validatedAt]);

  const signatureBlockReason = useMemo(() => {
    if (!signatureRequired) return null;
    if (invoiceSigned) return null;
    if (signaturePending) return "Signature en cours";
    return "Signature requise";
  }, [signatureRequired, invoiceSigned, signaturePending]);

  const ttnLocked = useMemo(() => {
    if (isDevis) return true;
    if (!isNotSent) return true;
    if (needsValidation) return true;
    if (signatureRequired && !invoiceSigned) return true;
    return false;
  }, [isDevis, isNotSent, needsValidation, signatureRequired, invoiceSigned]);

  const ttnLockedReason = useMemo(() => {
    if (isDevis) return "Devis non envoyable TTN";
    if (!isNotSent) return "TTN déjà traité";
    if (needsValidation) return "Validation requise";
    if (signatureRequired && !invoiceSigned) return "Signature requise";
    return null;
  }, [isDevis, isNotSent, needsValidation, signatureRequired, invoiceSigned]);

  const showGoToSignature = useMemo(() => {
    if (!signatureRequired) return false;
    if (invoiceSigned) return false;
    return true;
  }, [signatureRequired, invoiceSigned]);

  const [scheduleAt, setScheduleAt] = useState<string>(() => {
    if (ttnScheduledAt) return fmtDateTimeLocal(ttnScheduledAt);
    return nowLocalDefault();
  });

  async function callJson(url: string, method: "POST" | "PATCH" | "DELETE", body?: any) {
    setErr(null);
    setInfo(null);
    setBusy(url);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = s(data?.error || data?.message || `HTTP_${res.status}`);
        throw new Error(msg);
      }
      return data;
    } finally {
      setBusy(null);
    }
  }

  async function sendTTNNow() {
    const data = await callJson(`/api/invoices/${invoiceId}/ttn`, "POST");
    setInfo(data?.ok ? "Envoi TTN effectué" : "Envoi TTN terminé");
  }

  async function refreshTTN() {
    const data = await callJson(`/api/invoices/${invoiceId}/ttn/status`, "POST");
    setInfo(data?.ok ? "Statut TTN mis à jour" : "Mise à jour terminée");
  }

  async function scheduleTTN() {
    const atIso = new Date(scheduleAt).toISOString();
    const data = await callJson(`/api/invoices/${invoiceId}/ttn/schedule`, "POST", { scheduled_at: atIso });
    setInfo(data?.ok ? "Envoi TTN programmé" : "Programmation terminée");
  }

  async function cancelSchedule() {
    const data = await callJson(`/api/invoices/${invoiceId}/ttn/schedule`, "DELETE");
    setInfo(data?.ok ? "Programmation annulée" : "Annulation terminée");
  }

  const downloadPdfHref = `/api/invoices/${invoiceId}/pdf`;
  const downloadXmlHref = `/api/invoices/${invoiceId}/xml`;
  const downloadSignedXmlHref = `/api/invoices/${invoiceId}/xml/signed`;

  const canDownloadSignedXml = signatureRequired ? invoiceSigned : Boolean(invoiceSigned);

  return (
    <div className="mt-4 grid gap-3">
      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}
      {info ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {info}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <a
          href={downloadPdfHref}
          className="inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm text-white hover:bg-black/90"
        >
          Télécharger PDF (sans signature)
        </a>

        <a
          href={downloadXmlHref}
          className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50"
        >
          Télécharger XML (TEIF)
        </a>

        <a
          href={downloadSignedXmlHref}
          className={`inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50 ${
            canDownloadSignedXml ? "" : "opacity-50 pointer-events-none"
          }`}
        >
          Télécharger XML (signé)
        </a>

        {showGoToSignature ? (
          <Link
            href={`/invoices/${invoiceId}/signature`}
            className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50"
          >
            Voir facture pour signer
          </Link>
        ) : null}
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="text-sm font-semibold">TTN</div>
        <div className="mt-1 text-xs text-slate-500">
          {ttnLockedReason ? `Verrouillé: ${ttnLockedReason}` : "Prêt"}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => sendTTNNow()}
            disabled={ttnLocked || !canSendTTN || busy !== null}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm text-white ${
              ttnLocked || !canSendTTN || busy !== null ? "bg-indigo-300" : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            Envoyer à TTN
          </button>

          <button
            onClick={() => refreshTTN()}
            disabled={!canSendTTN || busy !== null}
            className={`inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm hover:bg-slate-50 ${
              busy !== null ? "opacity-50" : ""
            }`}
          >
            Actualiser statut TTN
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm"
            disabled={ttnLocked || busy !== null}
          />

          <button
            onClick={() => scheduleTTN()}
            disabled={ttnLocked || busy !== null}
            className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm ${
              ttnLocked || busy !== null ? "bg-slate-100 text-slate-400" : "bg-white hover:bg-slate-50"
            }`}
          >
            Programmer l’envoi
          </button>

          <button
            onClick={() => cancelSchedule()}
            disabled={busy !== null || !ttnScheduledAt}
            className={`inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm ${
              busy !== null || !ttnScheduledAt ? "bg-slate-100 text-slate-400" : "bg-white hover:bg-slate-50"
            }`}
          >
            Annuler programmation
          </button>
        </div>

        {signatureRequired ? (
          <div className="mt-4 text-xs text-slate-500">
            Signature: {signatureBlockReason ? signatureBlockReason : "OK"} — Provider: {signatureProvider || "none"}
            {digigoTransactionId ? ` — Tx: ${digigoTransactionId}` : ""}
            {digigoOtpId ? ` — OTP: ${digigoOtpId}` : ""}
            {viewedBeforeSignatureAt ? ` — Vue: ${new Date(viewedBeforeSignatureAt).toLocaleString()}` : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}
