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

export default function NewInvoiceClient({ companies }: { companies: Company[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [saving, startSaving] = useTransition();

  const [err, setErr] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState<string>(companies?.[0]?.id ?? "");
  const [documentType, setDocumentType] = useState<DocumentType>("facture");

  const [issueDate, setIssueDate] = useState<string>(todayISO());
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [uniqueRef, setUniqueRef] = useState<string>("");

  const [customerType, setCustomerType] = useState<CustomerType>("entreprise");

  const [customerName, setCustomerName] = useState<string>("");
  const [customerTaxId, setCustomerTaxId] = useState<string>("");
  const [customerEmail, setCustomerEmail] = useState<string>("");
  const [customerPhone, setCustomerPhone] = useState<string>("");
  const [customerAddress, setCustomerAddress] = useState<string>("");

  const [currency, setCurrency] = useState<string>("TND");
  const [stampAmount, setStampAmount] = useState<number>(1.0);

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

  function removeLine(lineNo: number) {
    setItems((prev) => {
      const filtered = prev.filter((x) => x.line_no !== lineNo);
      const renum = filtered.map((x, idx) => ({ ...x, line_no: idx + 1 }));
      return renum.length ? renum : prev;
    });
  }

  function updateLine(lineNo: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((x) => (x.line_no === lineNo ? { ...x, ...patch } : x)));
  }

  function validateForm(): string | null {
    if (!companyId) return "Société obligatoire.";
    if (!issueDate) return "Date d’émission obligatoire.";
    if (!iso4217OK(currency)) return "Devise invalide (ex: TND, EUR, USD).";

    if (!customerName.trim()) return "Client obligatoire.";

    if (customerType === "entreprise") {
      if (!customerTaxId.trim()) return "Matricule fiscal obligatoire pour un client entreprise.";
    }

    const clean = items
      .map((it) => ({
        ...it,
        description: (it.description || "").trim(),
        quantity: toNum(it.quantity, 0),
        unit_price_ht: toNum(it.unit_price_ht, 0),
        vat_pct: toNum(it.vat_pct, 0),
        discount_pct: toNum(it.discount_pct, 0),
      }))
      .filter((x) => x.description);

    if (!clean.length) return "Au moins une ligne (description) est obligatoire.";
    if (clean.some((x) => x.quantity <= 0)) return "Quantité doit être > 0.";
    if (clean.some((x) => x.unit_price_ht < 0)) return "PU HT ne peut pas être négatif.";
    if (clean.some((x) => x.vat_pct < 0 || x.vat_pct > 100)) return "TVA % doit être entre 0 et 100.";
    if (toNum(stampAmount, 0) < 0) return "Timbre fiscal invalide.";

    return null;
  }

  async function handleSave() {
    setErr(null);
    const v = validateForm();
    if (v) return setErr(v);

    startSaving(async () => {
      try {
        const payload: any = {
          company_id: companyId,

          unique_reference: uniqueRef.trim() || null,
          document_type: documentType,
          invoice_mode: "normal",

          issue_date: issueDate,
          invoice_number: invoiceNumber.trim() || null,

          customer_type: customerType,

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

        const cleanItems = items
          .map((it, idx) => ({
            invoice_id: invoiceId,
            line_no: idx + 1,
            description: (it.description || "").trim(),
            quantity: round3(toNum(it.quantity, 0)),
            unit_price_ht: round3(toNum(it.unit_price_ht, 0)),
            vat_pct: round3(toNum(it.vat_pct, 0)),
            discount_pct: round3(toNum(it.discount_pct, 0)),
          }))
          .filter((x) => x.description && x.quantity > 0);

        if (cleanItems.length) {
          const { error: eItems } = await supabase.from("invoice_items").insert(cleanItems);
          if (eItems) throw new Error(eItems.message);
        }

        router.push(`/invoices/${invoiceId}`);
        router.refresh();
      } catch (e: any) {
        setErr(e?.message || "Erreur enregistrement.");
      }
    });
  }

  const Req = () => <span className="text-rose-600 font-semibold ml-1">*</span>;

  return (
    <div className="p-6">
      <div className="ftn-card p-6">
        <div className="mb-4">
          <div className="text-xl font-semibold">Créer un document</div>
          <div className="text-sm text-slate-600">
            Création = Enregistrer. Signature, XML signé, dépôt TTN se font dans Voir facture.
          </div>
        </div>

        {err ? (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">
              Type de document <Req />
            </label>
            <select className="ftn-input mt-1 w-full" value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
              <option value="facture">Facture</option>
              <option value="devis">Devis</option>
              <option value="avoir">Avoir</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">
              Société <Req />
            </label>
            <select className="ftn-input mt-1 w-full" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">
              Date d’émission <Req />
            </label>
            <input type="date" className="ftn-input mt-1 w-full" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">
              Devise <Req />
            </label>
            <input className="ftn-input mt-1 w-full" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="TND" />
          </div>

          <div>
            <label className="text-sm font-medium">Numéro (optionnel)</label>
            <input className="ftn-input mt-1 w-full" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Référence / Renommer (optionnel)</label>
            <input className="ftn-input mt-1 w-full" value={uniqueRef} onChange={(e) => setUniqueRef(e.target.value)} />
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">
              Type client <Req />
            </label>
            <select className="ftn-input mt-1 w-full" value={customerType} onChange={(e) => setCustomerType(e.target.value as CustomerType)}>
              <option value="entreprise">Entreprise (assujetti)</option>
              <option value="particulier">Particulier</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">
              Client <Req />
            </label>
            <input className="ftn-input mt-1 w-full" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">
              Matricule fiscal {customerType === "entreprise" ? <Req /> : null}
            </label>
            <input
              className="ftn-input mt-1 w-full"
              value={customerTaxId}
              onChange={(e) => setCustomerTaxId(e.target.value)}
              placeholder={customerType === "entreprise" ? "Obligatoire" : "Optionnel"}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Téléphone (optionnel)</label>
            <input className="ftn-input mt-1 w-full" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Email (optionnel)</label>
            <input className="ftn-input mt-1 w-full" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium">Adresse (optionnel)</label>
            <input className="ftn-input mt-1 w-full" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">
              Lignes <Req />
            </div>
            <button className="ftn-btn" type="button" onClick={addLine}>
              Ajouter ligne
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-[52px]">#</th>
                  <th className="text-left font-medium px-3 py-2 min-w-[240px]">Description</th>
                  <th className="text-left font-medium px-3 py-2 w-[110px]">Qté</th>
                  <th className="text-left font-medium px-3 py-2 w-[140px]">PU HT</th>
                  <th className="text-left font-medium px-3 py-2 w-[110px]">TVA %</th>
                  <th className="text-left font-medium px-3 py-2 w-[120px]">Remise %</th>
                  <th className="text-right font-medium px-3 py-2 w-[70px]">—</th>
                </tr>
              </thead>

              <tbody>
                {items.map((r) => (
                  <tr key={r.line_no} className="border-t">
                    <td className="px-3 py-2 text-slate-500">{r.line_no}</td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full"
                        placeholder="Produit / service"
                        value={r.description}
                        onChange={(e) => updateLine(r.line_no, { description: e.target.value })}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input className="ftn-input w-full" value={r.quantity} onChange={(e) => updateLine(r.line_no, { quantity: toNum(e.target.value, 1) })} />
                    </td>

                    <td className="px-3 py-2">
                      <input className="ftn-input w-full" value={r.unit_price_ht} onChange={(e) => updateLine(r.line_no, { unit_price_ht: toNum(e.target.value, 0) })} />
                    </td>

                    <td className="px-3 py-2">
                      <input className="ftn-input w-full" value={r.vat_pct} onChange={(e) => updateLine(r.line_no, { vat_pct: toNum(e.target.value, 0) })} />
                    </td>

                    <td className="px-3 py-2">
                      <input className="ftn-input w-full" value={r.discount_pct} onChange={(e) => updateLine(r.line_no, { discount_pct: toNum(e.target.value, 0) })} />
                    </td>

                    <td className="px-3 py-2 text-right">
                      <button className="ftn-btn ftn-btn-ghost" type="button" onClick={() => removeLine(r.line_no)}>
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">Total HT</div>
              <div className="mt-1 text-2xl font-semibold">{fmt3(totals.subtotal_ht)} {currency.toUpperCase()}</div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">TVA</div>
              <div className="mt-1 text-2xl font-semibold">{fmt3(totals.total_vat)} {currency.toUpperCase()}</div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">Timbre fiscal</div>
              <div className="mt-2 flex items-center gap-2">
                <input className="ftn-input w-[110px]" value={stampAmount} onChange={(e) => setStampAmount(toNum(e.target.value, 1))} />
                <div className="text-sm text-slate-500">{currency.toUpperCase()}</div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">Net à payer</div>
              <div className="mt-1 text-2xl font-semibold">{fmt3(totals.net_to_pay)} {currency.toUpperCase()}</div>
              <div className="mt-1 text-xs text-slate-500">TTC sans timbre: {fmt3(totals.total_ttc)} {currency.toUpperCase()}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <Link className="ftn-btn ftn-btn-ghost" href="/invoices" prefetch={false}>
            Retour
          </Link>

          <button className="ftn-btn" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
