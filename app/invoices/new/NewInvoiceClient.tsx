"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; company_name: string };
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function iso4217OK(v: string) {
  const s = (v || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s);
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

export default function NewInvoiceClient({
  companies,
  defaultCompanyId,
}: {
  companies: Company[];
  defaultCompanyId?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const [modal, setModal] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });

  const [companyId, setCompanyId] = useState<string>(defaultCompanyId || companies?.[0]?.id || "");
  const [documentType, setDocumentType] = useState<DocumentType>("facture");
  const [customerType, setCustomerType] = useState<CustomerType>("entreprise");

  const [issueDate, setIssueDate] = useState<string>(todayISO());
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");

  const [customerName, setCustomerName] = useState<string>("");
  const [customerTaxId, setCustomerTaxId] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerAddress, setCustomerAddress] = useState<string>("");

  const [currency, setCurrency] = useState<string>("TND");
  const [stampAmount, setStampAmount] = useState<number>(1);

  const [items, setItems] = useState<ItemRow[]>([
    { line_no: 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 },
  ]);

  const totals = useMemo(() => {
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
  }, [items, stampAmount]);

  function addLine() {
    setItems((prev) => [
      ...prev,
      { line_no: prev.length + 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 },
    ]);
  }

  function removeLine(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, line_no: idx + 1 })));
  }

  function updateLine(i: number, key: keyof ItemRow, value: any) {
    setItems((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        return { ...row, [key]: value };
      })
    );
  }

  function openError(msg: string) {
    setModal({ open: true, title: "Erreur", message: msg });
  }
  function openInfo(msg: string) {
    setModal({ open: true, title: "Info", message: msg });
  }

  async function onCreate() {
    if (isPending) return;

    if (!companyId) return openError("Veuillez choisir une société.");
    if (!customerName.trim()) return openError("Veuillez saisir le nom du client.");
    if (!issueDate) return openError("Veuillez choisir une date.");
    if (!iso4217OK(currency)) return openError("Devise invalide (ex: TND, EUR, USD).");

    //  MF obligatoire si entreprise
    if (customerType === "entreprise") {
      const mf = (customerTaxId || "").trim();
      if (!mf) return openError("MF obligatoire pour un client Entreprise.");
      // (optionnel) mini contrôle longueur
      if (mf.length < 4) return openError("MF invalide (trop court).");
    }

    const validItems = items
      .map((it) => ({
        ...it,
        description: (it.description || "").trim(),
        quantity: toNum(it.quantity, 0),
        unit_price_ht: toNum(it.unit_price_ht, 0),
        vat_pct: toNum(it.vat_pct, 0),
        discount_pct: toNum(it.discount_pct, 0),
      }))
      .filter((it) => it.description && it.quantity > 0);

    if (!validItems.length) return openError("Ajoutez au moins une ligne avec description et quantité > 0.");

    startTransition(async () => {
      try {
        // IMPORTANT:
        // on NE met PAS customer_type car ta DB n'a pas cette colonne.
        const payload: any = {
          company_id: companyId,
          document_type: documentType,
          invoice_mode: "normal",

          issue_date: issueDate,
          invoice_number: invoiceNumber.trim() || null,

          customer_name: customerName.trim(),
          customer_tax_id: customerTaxId.trim() || null,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          customer_address: customerAddress.trim() || null,

          currency: currency.trim().toUpperCase(),

          subtotal_ht: totals.subtotal_ht,
          total_vat: totals.total_vat,
          total_ttc: totals.total_ttc,

          stamp_enabled: true,
          stamp_amount: totals.stamp_amount,
          net_to_pay: totals.net_to_pay,

          send_mode: "manual",
          ttn_status: "not_sent",
          status: "draft",
        };

        const { data, error } = await supabase.from("invoices").insert(payload).select("id").single();
        if (error) throw new Error(error.message);

        const invoiceId = String((data as any)?.id);
        if (!invoiceId) throw new Error("ID facture manquant.");

        // Calcul + insert des totaux de lignes 
        const cleanItems = items
          .map((it, idx) => {
            const qty = round3(toNum(it.quantity, 0));
            const pu = round3(toNum(it.unit_price_ht, 0));
            const vat = round3(toNum(it.vat_pct, 0));
            const disc = round3(toNum(it.discount_pct, 0));

            const line_ht = qty * pu;
            const line_disc = line_ht * (disc / 100);
            const net_ht = line_ht - line_disc;

            const vat_amount = net_ht * (vat / 100);
            const line_ttc = net_ht + vat_amount;

            return {
              invoice_id: invoiceId,
              line_no: idx + 1,
              description: (it.description || "").trim(),
              quantity: qty,
              unit_price_ht: pu,
              vat_pct: vat,
              discount_pct: disc,
              line_total_ht: round3(net_ht),
              line_vat_amount: round3(vat_amount),
              line_total_ttc: round3(line_ttc),
            };
          })
          .filter((x) => x.description && x.quantity > 0);

        if (cleanItems.length) {
          const { error: eItems } = await supabase.from("invoice_items").insert(cleanItems);
          if (eItems) throw new Error(eItems.message);
        }

        openInfo("Enregistrement réussi.");
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
    <div className="ftn-page pb-24">
      <Modal open={modal.open} title={modal.title} message={modal.message} onClose={() => setModal((m) => ({ ...m, open: false }))} />

      <div className="ftn-page-head">
        <div>
          <h1 className="ftn-h1">Nouvelle facture</h1>
          <p className="ftn-subtitle">Créer une facture, devis ou avoir avec calcul TVA et timbre.</p>
        </div>

        {/* Boutons haut (tu peux garder) */}
        <div className="flex gap-2">
          <Link className="ftn-btn ftn-btn-ghost" href="/invoices">
            Retour
          </Link>
          <button className="ftn-btn" onClick={onCreate} disabled={isPending}>
            {isPending ? "En cours..." : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="ftn-grid-2">
        <div className="ftn-card p-5">
          <div className="ftn-section-title">Document</div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="ftn-label">Société</label>
              <select className="ftn-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">-- Choisir --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ftn-label">Type</label>
              <select className="ftn-input" value={documentType} onChange={(e) => setDocumentType(e.target.value as any)}>
                <option value="facture">Facture</option>
                <option value="devis">Devis</option>
                <option value="avoir">Avoir</option>
              </select>
            </div>

            <div>
              <label className="ftn-label">Date</label>
              <input className="ftn-input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>

            <div>
              <label className="ftn-label">Numéro (optionnel)</label>
              <input className="ftn-input" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ex: F-2026-0001" />
            </div>

            <div>
              <label className="ftn-label">Devise</label>
              <input className="ftn-input" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="TND" />
            </div>

            <div>
              <label className="ftn-label">Timbre (DT)</label>
              <input className="ftn-input" type="number" step="0.001" value={stampAmount} onChange={(e) => setStampAmount(toNum(e.target.value, 0))} />
            </div>
          </div>
        </div>

        <div className="ftn-card p-5">
          <div className="ftn-section-title">Client</div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="ftn-label">Type client</label>
              <select className="ftn-input" value={customerType} onChange={(e) => setCustomerType(e.target.value as any)}>
                <option value="entreprise">Entreprise</option>
                <option value="particulier">Particulier</option>
              </select>
            </div>

            <div>
              <label className="ftn-label">Nom</label>
              <input className="ftn-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nom client" />
            </div>

            <div>
              <label className="ftn-label">{mfLabel}</label>
              <input
                className="ftn-input"
                value={customerTaxId}
                onChange={(e) => setCustomerTaxId(e.target.value)}
                placeholder={mfPlaceholder}
              />
              {customerType === "entreprise" ? (
                <div className="mt-1 text-xs text-[var(--muted)]">Obligatoire pour TVA / entreprise.</div>
              ) : null}
            </div>

            <div>
              <label className="ftn-label">Email (optionnel)</label>
              <input className="ftn-input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="client@email.tn" />
            </div>

            <div>
              <label className="ftn-label">Téléphone (optionnel)</label>
              <input className="ftn-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="+216 ..." />
            </div>

            <div>
              <label className="ftn-label">Adresse (optionnel)</label>
              <input className="ftn-input" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} placeholder="Adresse" />
            </div>
          </div>
        </div>
      </div>

      <div className="ftn-card p-5 mt-4">
        <div className="flex items-center justify-between">
          <div className="ftn-section-title">Lignes</div>
          <button className="ftn-btn ftn-btn-ghost" onClick={addLine}>
            + Ajouter ligne
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ftn-table">
            <thead>
              <tr>
                <th style={{ width: 52 }}>#</th>
                <th>Description</th>
                <th style={{ width: 110 }}>Qté</th>
                <th style={{ width: 130 }}>PU HT</th>
                <th style={{ width: 110 }}>TVA%</th>
                <th style={{ width: 120 }}>Remise%</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td>
                    <input
                      className="ftn-input"
                      value={it.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      placeholder="Description"
                    />
                  </td>
                  <td>
                    <input
                      className="ftn-input"
                      type="number"
                      step="0.001"
                      value={it.quantity}
                      onChange={(e) => updateLine(idx, "quantity", toNum(e.target.value, 0))}
                    />
                  </td>
                  <td>
                    <input
                      className="ftn-input"
                      type="number"
                      step="0.001"
                      value={it.unit_price_ht}
                      onChange={(e) => updateLine(idx, "unit_price_ht", toNum(e.target.value, 0))}
                    />
                  </td>
                  <td>
                    <input
                      className="ftn-input"
                      type="number"
                      step="0.001"
                      value={it.vat_pct}
                      onChange={(e) => updateLine(idx, "vat_pct", toNum(e.target.value, 0))}
                    />
                  </td>
                  <td>
                    <input
                      className="ftn-input"
                      type="number"
                      step="0.001"
                      value={it.discount_pct}
                      onChange={(e) => updateLine(idx, "discount_pct", toNum(e.target.value, 0))}
                    />
                  </td>
                  <td className="text-right">
                    {items.length > 1 ? (
                      <button className="ftn-btn ftn-btn-danger ftn-btn-sm" onClick={() => removeLine(idx)}>
                        Supprimer
                      </button>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-sm ftn-card p-4">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--muted)]">Total HT</span>
              <span className="font-medium">{fmt3(totals.subtotal_ht)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-[var(--muted)]">Total TVA</span>
              <span className="font-medium">{fmt3(totals.total_vat)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="text-[var(--muted)]">Timbre</span>
              <span className="font-medium">{fmt3(totals.stamp_amount)}</span>
            </div>
            <div className="flex justify-between text-sm mt-2 pt-2 border-t border-[var(--border)]">
              <span className="font-semibold">Total TTC</span>
              <span className="font-semibold">{fmt3(totals.net_to_pay)}</span>
            </div>
          </div>
        </div>
      </div>

      {/*  Barre sticky EN BAS */}
      <div className="fixed left-0 right-0 bottom-0 z-[70]">
        <div className="mx-auto max-w-[1200px] px-4 pb-4">
          <div className="ftn-card p-3 flex items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-semibold">Total TTC : {fmt3(totals.net_to_pay)}</div>
              <div className="text-[var(--muted)] text-xs">Timbre inclus.</div>
            </div>
            <div className="flex gap-2">
              <Link className="ftn-btn ftn-btn-ghost" href="/invoices">
                Annuler
              </Link>
              <button className="ftn-btn" onClick={onCreate} disabled={isPending}>
                {isPending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
