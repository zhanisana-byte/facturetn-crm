"use client";

import { useMemo, useState, useTransition } from "react";

type DocumentType = "facture" | "devis" | "avoir";
type CustomerType = "entreprise" | "particulier";

type ItemRow = {
  id?: string;
  line_no: number;
  item_code: string;
  unit_code: string;
  description: string;
  quantity: number;
  unit_price_ht: number;
  vat_pct: number;
  discount_pct: number;
  discount_amount: number;
  line_notes: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function toNum(v: any, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function fmt3(n: number) {
  return round3(toNum(n, 0)).toFixed(3);
}

function iso4217OK(v: string) {
  const x = (v || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(x);
}

function clampPct(x: number) {
  const n = toNum(x, 0);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function computeTotals(items: ItemRow[], stampAmount: number) {
  let subtotal_ht = 0;
  let total_vat = 0;

  for (const it of items) {
    const qty = toNum(it.quantity, 0);
    const pu = toNum(it.unit_price_ht, 0);
    const vat = clampPct(it.vat_pct);
    const discPct = clampPct(it.discount_pct);
    const discAmt = Math.max(0, toNum(it.discount_amount, 0));

    const line_ht = qty * pu;
    const byPct = line_ht * (discPct / 100);
    const disc = Math.min(line_ht, byPct + discAmt);

    const net_ht = line_ht - disc;
    subtotal_ht += net_ht;
    total_vat += net_ht * (vat / 100);
  }

  subtotal_ht = round3(subtotal_ht);
  total_vat = round3(total_vat);

  const total_ttc = round3(subtotal_ht + total_vat);
  const stamp_amount = round3(Math.max(0, toNum(stampAmount, 0)));
  const net_to_pay = round3(total_ttc + stamp_amount);

  return { subtotal_ht, total_vat, total_ttc, stamp_amount, net_to_pay };
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

export default function InlineInvoiceEditor({
  invoice,
  items,
  onSaved,
}: {
  invoice: any;
  items: any[];
  onSaved?: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const invoiceId = s(invoice?.id);
  const signatureStatus = s(invoice?.signature_status || "").toLowerCase();
  const signed = signatureStatus === "signed";
  const locked = !!invoice?.locked_at;

  const [modal, setModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });

  const [documentType, setDocumentType] = useState<DocumentType>(
    ((s(invoice?.document_type || "facture").toLowerCase() as any) || "facture") as DocumentType
  );

  const [customerType, setCustomerType] = useState<CustomerType>(() => {
    const mf = s(invoice?.customer_tax_id);
    return mf ? "entreprise" : "particulier";
  });

  const [issueDate, setIssueDate] = useState<string>(s(invoice?.issue_date || "").slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(s(invoice?.due_date || "").slice(0, 10));
  const [invoiceNumber, setInvoiceNumber] = useState<string>(s(invoice?.invoice_number || ""));

  const [customerName, setCustomerName] = useState<string>(s(invoice?.customer_name || ""));
  const [customerTaxId, setCustomerTaxId] = useState<string>(s(invoice?.customer_tax_id || ""));
  const [customerIdentifierType, setCustomerIdentifierType] = useState<string>(s(invoice?.customer_identifier_type || ""));
  const [customerEmail, setCustomerEmail] = useState<string>(s(invoice?.customer_email || ""));
  const [customerPhone, setCustomerPhone] = useState<string>(s(invoice?.customer_phone || ""));
  const [customerAddress, setCustomerAddress] = useState<string>(s(invoice?.customer_address || ""));
  const [customerCity, setCustomerCity] = useState<string>(s(invoice?.customer_city || ""));
  const [customerZip, setCustomerZip] = useState<string>(s(invoice?.customer_zip || ""));
  const [customerCountryCode, setCustomerCountryCode] = useState<string>(s(invoice?.customer_country_code || "TN"));

  const [currency, setCurrency] = useState<string>(s(invoice?.currency || "TND") || "TND");
  const [stampAmount, setStampAmount] = useState<number>(toNum(invoice?.stamp_amount, 0));

  const [paymentTerms, setPaymentTerms] = useState<string>(s(invoice?.payment_terms || ""));
  const [paymentMeansCode, setPaymentMeansCode] = useState<string>(s(invoice?.payment_means_code || ""));
  const [notes, setNotes] = useState<string>(s(invoice?.notes || ""));

  const [rows, setRows] = useState<ItemRow[]>(
    (items ?? []).length
      ? (items as any[]).map((it, idx) => ({
          id: s(it.id) || undefined,
          line_no: toNum(it.line_no, idx + 1),

          item_code: s(it.item_code || ""),
          unit_code: s(it.unit_code || "PCE"),

          description: s(it.description || ""),
          quantity: toNum(it.quantity, 1),
          unit_price_ht: toNum(it.unit_price_ht, 0),
          vat_pct: toNum(it.vat_pct, 19),
          discount_pct: toNum(it.discount_pct, 0),
          discount_amount: toNum(it.discount_amount, 0),
          line_notes: s(it.line_notes || ""),
        }))
      : [
          {
            line_no: 1,
            item_code: "",
            unit_code: "PCE",
            description: "",
            quantity: 1,
            unit_price_ht: 0,
            vat_pct: 19,
            discount_pct: 0,
            discount_amount: 0,
            line_notes: "",
          },
        ]
  );

  const totals = useMemo(() => computeTotals(rows, stampAmount), [rows, stampAmount]);

  function openError(msg: string) {
    setModal({ open: true, title: "Erreur", message: msg });
  }

  function addLine() {
    setRows((prev) => [
      ...prev,
      {
        line_no: prev.length + 1,
        item_code: "",
        unit_code: "PCE",
        description: "",
        quantity: 1,
        unit_price_ht: 0,
        vat_pct: 19,
        discount_pct: 0,
        discount_amount: 0,
        line_notes: "",
      },
    ]);
  }

  function removeLine(i: number) {
    setRows((prev) =>
      prev
        .filter((_, idx) => idx !== i)
        .map((x, idx) => ({
          ...x,
          line_no: idx + 1,
        }))
    );
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
    if (!invoiceId) return openError("ID document manquant.");
    if (signed || locked) return openError("Document signé/verrouillé : modification bloquée.");

    if (!customerName.trim()) return openError("Veuillez saisir le nom du client.");
    if (!issueDate) return openError("Veuillez choisir une date.");
    if (!iso4217OK(currency)) return openError("Devise invalide (ex: TND, EUR, USD).");

    if (customerType === "entreprise") {
      const mf = (customerTaxId || "").trim();
      if (!mf) return openError("MF obligatoire pour un client Entreprise.");
      if (mf.length < 4) return openError("MF invalide.");
    }

    const cleanedItems = rows
      .map((it, idx) => ({
        id: it.id,
        line_no: idx + 1,
        item_code: s(it.item_code) || null,
        unit_code: s(it.unit_code) || null,
        description: s(it.description),
        quantity: toNum(it.quantity, 0),
        unit_price_ht: toNum(it.unit_price_ht, 0),
        vat_pct: toNum(it.vat_pct, 0),
        discount_pct: toNum(it.discount_pct, 0),
        discount_amount: round3(Math.max(0, toNum(it.discount_amount, 0))),
        line_notes: s(it.line_notes) || null,
      }))
      .filter((it) => it.description && it.quantity > 0);

    if (!cleanedItems.length) return openError("Ajoutez au moins une ligne avec description et quantité > 0.");

    startTransition(async () => {
      try {
        const payload = {
          document_type: documentType,
          issue_date: issueDate,
          due_date: dueDate || null,
          invoice_number: invoiceNumber.trim() || null,

          customer_name: customerName.trim(),
          customer_tax_id: customerTaxId.trim() || null,
          customer_identifier_type: customerIdentifierType.trim() || null,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          customer_address: customerAddress.trim() || null,
          customer_city: customerCity.trim() || null,
          customer_zip: customerZip.trim() || null,
          customer_country_code: customerCountryCode.trim().toUpperCase() || "TN",

          currency: currency.trim().toUpperCase(),
          stamp_amount: round3(toNum(stampAmount, 0)),

          payment_terms: paymentTerms.trim() || null,
          payment_means_code: paymentMeansCode.trim() || null,
          notes: notes.trim() || null,

          items: cleanedItems,
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

        onSaved?.();
      } catch (e: any) {
        openError(e?.message || "Erreur inconnue.");
      }
    });
  }

  const mfLabel = customerType === "entreprise" ? "MF (obligatoire)" : "MF (optionnel)";
  const mfPlaceholder = customerType === "entreprise" ? "Matricule fiscal (obligatoire)" : "Matricule fiscal";

  return (
    <div className="ftn-card p-5 mt-4">
      <Modal open={modal.open} title={modal.title} message={modal.message} onClose={() => setModal((m) => ({ ...m, open: false }))} />

      <div className="flex items-center justify-between gap-2">
        <div className="ftn-section-title">Modifier la facture</div>
        <div className="flex gap-2">
          <button className="ftn-btn" onClick={onSave} disabled={signed || locked || isPending}>
            Enregistrer
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="ftn-card p-5">
          <div className="ftn-section-title">Document</div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="ftn-label">Type</label>
              <select className="ftn-input" value={documentType} onChange={(e) => setDocumentType(e.target.value as any)} disabled={signed || locked}>
                <option value="facture">Facture</option>
                <option value="devis">Devis</option>
                <option value="avoir">Avoir</option>
              </select>
            </div>

            <div>
              <label className="ftn-label">Date</label>
              <input className="ftn-input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Échéance (optionnel)</label>
              <input className="ftn-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Numéro (optionnel)</label>
              <input className="ftn-input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ex: F-2026-0001" disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Devise</label>
              <input className="ftn-input" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="TND" disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Timbre (DT)</label>
              <input className="ftn-input" type="number" step="0.001" value={stampAmount} onChange={(e) => setStampAmount(toNum(e.target.value, 0))} disabled={signed || locked} />
            </div>

            <div className="col-span-2">
              <label className="ftn-label">Conditions de paiement (optionnel)</label>
              <input className="ftn-input" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Ex: 30 jours fin de mois" disabled={signed || locked} />
            </div>

            <div className="col-span-2">
              <label className="ftn-label">Moyen de paiement (optionnel)</label>
              <input className="ftn-input" value={paymentMeansCode} onChange={(e) => setPaymentMeansCode(e.target.value)} placeholder="Ex: VIREMENT / ESPECES" disabled={signed || locked} />
            </div>

            <div className="col-span-2">
              <label className="ftn-label">Notes (optionnel)</label>
              <textarea className="ftn-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={signed || locked} />
            </div>
          </div>
        </div>

        <div className="ftn-card p-5">
          <div className="ftn-section-title">Client</div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="ftn-label">Type client</label>
              <select className="ftn-input" value={customerType} onChange={(e) => setCustomerType(e.target.value as any)} disabled={signed || locked}>
                <option value="entreprise">Entreprise</option>
                <option value="particulier">Particulier</option>
              </select>
            </div>

            <div>
              <label className="ftn-label">Nom</label>
              <input className="ftn-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom client" disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">{mfLabel}</label>
              <input className="ftn-input" value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} placeholder={mfPlaceholder} disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Type identifiant (I-0) (optionnel)</label>
              <input className="ftn-input" value={customerIdentifierType} onChange={(e) => setCustomerIdentifierType(e.target.value)} placeholder="Ex: I-01" disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Email (optionnel)</label>
              <input className="ftn-input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="client@email.tn" disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Téléphone (optionnel)</label>
              <input className="ftn-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+216 ..." disabled={signed || locked} />
            </div>

            <div className="col-span-2">
              <label className="ftn-label">Adresse (optionnel)</label>
              <input className="ftn-input" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Adresse" disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Ville (optionnel)</label>
              <input className="ftn-input" value={customerCity} onChange={(e) => setCustomerCity(e.target.value)} placeholder="Ville" disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Code postal (optionnel)</label>
              <input className="ftn-input" value={customerZip} onChange={(e) => setCustomerZip(e.target.value)} placeholder="xxxx" disabled={signed || locked} />
            </div>

            <div>
              <label className="ftn-label">Pays (optionnel)</label>
              <input className="ftn-input" value={customerCountryCode} onChange={(e) => setCustomerCountryCode(e.target.value)} placeholder="TN" disabled={signed || locked} />
            </div>
          </div>
        </div>
      </div>

      <div className="ftn-card p-5 mt-4">
        <div className="flex items-center justify-between">
          <div className="ftn-section-title">Lignes</div>
          <button className="ftn-btn ftn-btn-ghost" onClick={addLine} disabled={signed || locked}>
            Ajouter ligne
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ftn-table">
            <thead>
              <tr>
                <th style={{ width: 52 }}>#</th>
                <th style={{ width: 150 }}>Code</th>
                <th style={{ width: 110 }}>Unité</th>
                <th>Description</th>
                <th style={{ width: 110 }}>Qté</th>
                <th style={{ width: 140 }}>PU HT</th>
                <th style={{ width: 130 }}>Remise %</th>
                <th style={{ width: 140 }}>Remise DT</th>
                <th style={{ width: 110 }}>TVA %</th>
                <th style={{ width: 110 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((it, i) => (
                <tr key={it.id || `${it.line_no}-${i}`}>
                  <td>{i + 1}</td>
                  <td>
                    <input className="ftn-input" value={it.item_code} onChange={(e) => updateLine(i, "item_code", e.target.value)} disabled={signed || locked} />
                  </td>
                  <td>
                    <input className="ftn-input" value={it.unit_code} onChange={(e) => updateLine(i, "unit_code", e.target.value)} disabled={signed || locked} />
                  </td>
                  <td>
                    <input className="ftn-input" value={it.description} onChange={(e) => updateLine(i, "description", e.target.value)} disabled={signed || locked} />
                    <div className="mt-2">
                      <input
                        className="ftn-input"
                        value={it.line_notes}
                        onChange={(e) => updateLine(i, "line_notes", e.target.value)}
                        placeholder="Note ligne (optionnel)"
                        disabled={signed || locked}
                      />
                    </div>
                  </td>
                  <td>
                    <input className="ftn-input" type="number" step="0.001" value={it.quantity} onChange={(e) => updateLine(i, "quantity", toNum(e.target.value, 0))} disabled={signed || locked} />
                  </td>
                  <td>
                    <input className="ftn-input" type="number" step="0.001" value={it.unit_price_ht} onChange={(e) => updateLine(i, "unit_price_ht", toNum(e.target.value, 0))} disabled={signed || locked} />
                  </td>
                  <td>
                    <input className="ftn-input" type="number" step="0.001" value={it.discount_pct} onChange={(e) => updateLine(i, "discount_pct", toNum(e.target.value, 0))} disabled={signed || locked} />
                  </td>
                  <td>
                    <input className="ftn-input" type="number" step="0.001" value={it.discount_amount} onChange={(e) => updateLine(i, "discount_amount", toNum(e.target.value, 0))} disabled={signed || locked} />
                  </td>
                  <td>
                    <input className="ftn-input" type="number" step="0.001" value={it.vat_pct} onChange={(e) => updateLine(i, "vat_pct", toNum(e.target.value, 0))} disabled={signed || locked} />
                  </td>
                  <td>
                    <button className="ftn-btn ftn-btn-danger" onClick={() => removeLine(i)} disabled={signed || locked || rows.length <= 1}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2" />
          <div className="ftn-card p-5">
            <div className="ftn-section-title">Totaux</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Total HT</span>
                <span className="font-medium">{fmt3(totals.subtotal_ht)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Total TVA</span>
                <span className="font-medium">{fmt3(totals.total_vat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">Timbre</span>
                <span className="font-medium">{fmt3(totals.stamp_amount)}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between">
                <span className="font-semibold">Net à payer</span>
                <span className="font-semibold">{fmt3(totals.net_to_pay)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {(signed || locked) ? (
        <div className="mt-3 text-sm text-rose-700">
          Document signé/verrouillé : modification désactivée.
        </div>
      ) : null}
    </div>
  );
}
