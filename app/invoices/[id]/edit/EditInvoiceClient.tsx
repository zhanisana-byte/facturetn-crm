"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type DocumentType = "facture" | "devis" | "avoir";
type CustomerType = "entreprise" | "particulier";

type ItemRow = {
  id?: string;
  line_no: number;
  description: string;
  quantity: number;
  unit_price_ht: number;
  vat_pct: number;
  discount_pct: number;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function iso4217OK(v: string) {
  const x = (v || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(x);
}

function toNum(v: any, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function fmt3(n: number) {
  return round3(n).toFixed(3);
}

function computeTotals(items: ItemRow[], stampAmount: number) {
  let subtotal_ht = 0;
  let total_vat = 0;

  for (const it of items) {
    const qty = toNum(it.quantity, 0);
    const pu = toNum(it.unit_price_ht, 0);
    const vat = toNum(it.vat_pct, 0);
    const disc = toNum(it.discount_pct, 0);

    const line_ht = qty * pu;
    const line_disc = line_ht * (disc / 100);
    const net_ht = line_ht - line_disc;

    subtotal_ht += net_ht;
    total_vat += net_ht * (vat / 100);
  }

  subtotal_ht = round3(subtotal_ht);
  total_vat = round3(total_vat);

  const total_ttc = round3(subtotal_ht + total_vat);
  const stamp = round3(toNum(stampAmount, 0));
  const net_to_pay = round3(total_ttc + stamp);

  return { subtotal_ht, total_vat, total_ttc, stamp_amount: stamp, net_to_pay };
}

function Modal({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg ftn-card p-5">
        <div className="text-lg font-semibold">{title}</div>
        <div className="mt-2 text-sm text-[var(--muted)] whitespace-pre-wrap">{message}</div>
        <div className="mt-4 flex justify-end">
          <button className="ftn-btn" onClick={onClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EditInvoiceClient({ invoice, items }: { invoice: any; items: any[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const invoiceId = s(invoice?.id);
  const signatureStatus = s(invoice?.signature_status || "").toLowerCase();
  const signed = signatureStatus === "signed";

  const [modal, setModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });

  const [documentType, setDocumentType] = useState<DocumentType>((s(invoice?.document_type || "facture").toLowerCase() as any) || "facture");

  const [customerType, setCustomerType] = useState<CustomerType>(() => {
    const mf = s(invoice?.customer_tax_id);
    return mf ? "entreprise" : "particulier";
  });

  const [issueDate, setIssueDate] = useState<string>(s(invoice?.issue_date || "").slice(0, 10));
  const [invoiceNumber, setInvoiceNumber] = useState<string>(s(invoice?.invoice_number || ""));

  const [customerName, setCustomerName] = useState<string>(s(invoice?.customer_name || ""));
  const [customerTaxId, setCustomerTaxId] = useState<string>(s(invoice?.customer_tax_id || ""));
  const [customerEmail, setCustomerEmail] = useState<string>(s(invoice?.customer_email || ""));
  const [customerPhone, setCustomerPhone] = useState<string>(s(invoice?.customer_phone || ""));
  const [customerAddress, setCustomerAddress] = useState<string>(s(invoice?.customer_address || ""));

  const [currency, setCurrency] = useState<string>(s(invoice?.currency || "TND") || "TND");
  const [stampAmount, setStampAmount] = useState<number>(toNum(invoice?.stamp_amount, 1));

  const [rows, setRows] = useState<ItemRow[]>(
    (items ?? []).length
      ? (items as any[]).map((it, idx) => ({
          id: s(it.id) || undefined,
          line_no: toNum(it.line_no, idx + 1),
          description: s(it.description || ""),
          quantity: toNum(it.quantity, 1),
          unit_price_ht: toNum(it.unit_price_ht, 0),
          vat_pct: toNum(it.vat_pct, 19),
          discount_pct: toNum(it.discount_pct, 0),
        }))
      : [{ line_no: 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 }]
  );

  const totals = useMemo(() => computeTotals(rows, stampAmount), [rows, stampAmount]);

  function openError(msg: string) {
    setModal({ open: true, title: "Erreur", message: msg });
  }

  function addLine() {
    setRows((prev) => [
      ...prev,
      { line_no: prev.length + 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 },
    ]);
  }

  function removeLine(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, line_no: idx + 1 })));
  }

  function updateLine(i: number, key: keyof ItemRow, value: any) {
    setRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        return { ...row, [key]: value };
      })
    );
  }

  async function onSave() {
    if (isPending) return;
    if (!invoiceId) return openError("ID facture manquant.");
    if (signed) return openError("Document signé : modification bloquée.");

    if (!customerName.trim()) return openError("Veuillez saisir le nom du client.");
    if (!issueDate) return openError("Veuillez choisir une date.");
    if (!iso4217OK(currency)) return openError("Devise invalide (ex: TND, EUR, USD).");

    if (customerType === "entreprise") {
      const mf = (customerTaxId || "").trim();
      if (!mf) return openError("MF obligatoire pour un client Entreprise.");
      if (mf.length < 4) return openError("MF invalide.");
    }

    const validItems = rows
      .map((it) => ({
        description: s(it.description),
        quantity: toNum(it.quantity, 0),
        unit_price_ht: toNum(it.unit_price_ht, 0),
        vat_pct: toNum(it.vat_pct, 0),
        discount_pct: toNum(it.discount_pct, 0),
      }))
      .filter((it) => it.description && it.quantity > 0);

    if (!validItems.length) return openError("Ajoutez au moins une ligne avec description et quantité > 0.");

    startTransition(async () => {
      try {
        const payload = {
          document_type: documentType,
          issue_date: issueDate,
          invoice_number: invoiceNumber.trim() || null,

          customer_name: customerName.trim(),
          customer_tax_id: customerTaxId.trim() || null,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          customer_address: customerAddress.trim() || null,

          currency: currency.trim().toUpperCase(),
          stamp_amount: round3(toNum(stampAmount, 0)),

          items: rows,
        };

        const res = await fetch(`/api/invoices/${invoiceId}/update`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || `Erreur mise à jour (${res.status}).`);
        }

        router.push(`/invoices/${invoiceId}`);
        router.refresh();
      } catch (e: any) {
        openError(e?.message || "Erreur inconnue.");
      }
    });
  }

  const mfLabel = customerType === "entreprise" ? "MF (obligatoire)" : "MF (optionnel)";
  const mfPlaceholder = customerType === "entreprise" ? "Matricule fiscal (obligatoire)" : "Matricule fiscal";

  return (
    <div className="ftn-page pb-28">
      <Modal open={modal.open} title={modal.title} message={modal.message} onClose={() => setModal((m) => ({ ...m, open: false }))} />

      <div className="ftn-page-head">
        <div>
          <h1 className="ftn-h1">Modifier document</h1>
          <p className="ftn-subtitle">Facture / Devis / Avoir</p>
        </div>
        <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${invoiceId}`}>
          Retour
        </Link>
      </div>

      <div className="ftn-grid-2">
        <div className="ftn-card p-5">
          <div className="ftn-section-title">Document</div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="ftn-label">Type</label>
              <select className="ftn-input" value={documentType} onChange={(e) => setDocumentType(e.target.value as any)} disabled={signed}>
                <option value="facture">Facture</option>
                <option value="devis">Devis</option>
                <option value="avoir">Avoir</option>
              </select>
            </div>

            <div>
              <label className="ftn-label">Date</label>
              <input className="ftn-input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={signed} />
            </div>

            <div>
              <label className="ftn-label">Numéro (optionnel)</label>
              <input className="ftn-input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ex: F-2026-0001" disabled={signed} />
            </div>

            <div>
              <label className="ftn-label">Devise</label>
              <input className="ftn-input" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="TND" disabled={signed} />
            </div>

            <div>
              <label className="ftn-label">Timbre (DT)</label>
              <input className="ftn-input" type="number" step="0.001" value={stampAmount} onChange={(e) => setStampAmount(toNum(e.target.value, 0))} disabled={signed} />
            </div>
          </div>
        </div>

        <div className="ftn-card p-5">
          <div className="ftn-section-title">Client</div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="ftn-label">Type client</label>
              <select className="ftn-input" value={customerType} onChange={(e) => setCustomerType(e.target.value as any)} disabled={signed}>
                <option value="entreprise">Entreprise</option>
                <option value="particulier">Particulier</option>
              </select>
            </div>

            <div>
              <label className="ftn-label">Nom</label>
              <input className="ftn-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom client" disabled={signed} />
            </div>

            <div>
              <label className="ftn-label">{mfLabel}</label>
              <input className="ftn-input" value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} placeholder={mfPlaceholder} disabled={signed} />
            </div>

            <div>
              <label className="ftn-label">Email (optionnel)</label>
              <input className="ftn-input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="client@email.tn" disabled={signed} />
            </div>

            <div>
              <label className="ftn-label">Téléphone (optionnel)</label>
              <input className="ftn-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+216 ..." disabled={signed} />
            </div>

            <div>
              <label className="ftn-label">Adresse (optionnel)</label>
              <input className="ftn-input" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Adresse" disabled={signed} />
            </div>
          </div>
        </div>
      </div>

      <div className="ftn-card p-5 mt-4">
        <div className="flex items-center justify-between">
          <div className="ftn-section-title">Lignes</div>
          <button className="ftn-btn ftn-btn-ghost" onClick={addLine} disabled={signed}>
            Ajouter ligne
          </button>
        </div>

        <div className="mt
