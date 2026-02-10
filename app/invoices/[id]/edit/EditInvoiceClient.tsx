"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function fmt3(v: any) {
  const x = n(v);
  return (Math.round(x * 1000) / 1000).toFixed(3);
}

function round3(x: number) {
  return Math.round(x * 1000) / 1000;
}

type ItemRow = {
  id?: string;
  line_no: number;
  description: string;
  quantity: number;
  unit_price_ht: number;
  vat_pct: number;
  discount_pct: number;
};

export default function EditInvoiceClient({ invoice, items }: { invoice: any; items: any[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const invoiceId = String(invoice?.id || "");

  const [issueDate, setIssueDate] = useState<string>(String(invoice?.issue_date || ""));
  const [invoiceNumber, setInvoiceNumber] = useState<string>(String(invoice?.invoice_number || ""));

  const [customerName, setCustomerName] = useState<string>(String(invoice?.customer_name || ""));
  const [customerTaxId, setCustomerTaxId] = useState<string>(String(invoice?.customer_tax_id || ""));
  const [customerEmail, setCustomerEmail] = useState<string>(String(invoice?.customer_email || ""));
  const [customerPhone, setCustomerPhone] = useState<string>(String(invoice?.customer_phone || ""));
  const [customerAddress, setCustomerAddress] = useState<string>(String(invoice?.customer_address || ""));

  const [currency, setCurrency] = useState<string>(String(invoice?.currency || "TND"));
  const [stampAmount, setStampAmount] = useState<number>(n(invoice?.stamp_amount ?? 1));

  const [lines, setLines] = useState<ItemRow[]>(
    (items ?? []).length
      ? (items ?? []).map((it: any, idx: number) => ({
          id: it.id,
          line_no: Number(it.line_no ?? idx + 1),
          description: String(it.description ?? ""),
          quantity: n(it.quantity ?? 1),
          unit_price_ht: n(it.unit_price_ht ?? 0),
          vat_pct: n(it.vat_pct ?? 19),
          discount_pct: n(it.discount_pct ?? 0),
        }))
      : [{ line_no: 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 }],
  );

  const totals = useMemo(() => {
    let subtotal_ht = 0;
    let total_vat = 0;

    for (const it of lines) {
      const qty = n(it.quantity);
      const pu = n(it.unit_price_ht);
      const vat = n(it.vat_pct);
      const disc = n(it.discount_pct);

      const line_ht = qty * pu;
      const line_disc = line_ht * (disc / 100);
      const net_ht = line_ht - line_disc;

      subtotal_ht += net_ht;
      total_vat += net_ht * (vat / 100);
    }

    subtotal_ht = round3(subtotal_ht);
    total_vat = round3(total_vat);

    const total_ttc = round3(subtotal_ht + total_vat);
    const stamp = round3(n(stampAmount));
    const net_to_pay = round3(total_ttc + stamp);

    return { subtotal_ht, total_vat, total_ttc, stamp, net_to_pay };
  }, [lines, stampAmount]);

  function addLine() {
    setLines((prev) => [...prev, { line_no: prev.length + 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, line_no: idx + 1 })));
  }

  function updateLine(i: number, key: keyof ItemRow, value: any) {
    setLines((prev) => prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));
  }

  async function onSave() {
    if (!invoiceId) return;

    if (!customerName.trim()) return alert("Nom client obligatoire.");
    if (!issueDate) return alert("Date obligatoire.");
    if (!currency.trim()) return alert("Devise obligatoire.");

    const cleanItems = lines
      .map((it, idx) => ({
        line_no: idx + 1,
        description: String(it.description || "").trim(),
        quantity: round3(n(it.quantity)),
        unit_price_ht: round3(n(it.unit_price_ht)),
        vat_pct: round3(n(it.vat_pct)),
        discount_pct: round3(n(it.discount_pct)),
      }))
      .filter((it) => it.description && it.quantity > 0);

    if (!cleanItems.length) return alert("Ajoutez au moins une ligne valide.");

    startTransition(async () => {
      try {
        const invPatch: any = {
          issue_date: issueDate,
          invoice_number: invoiceNumber.trim() || null,

          customer_name: customerName.trim(),
          customer_tax_id: customerTaxId.trim() || null,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          customer_address: customerAddress.trim() || null,

          currency: currency.trim().toUpperCase(),

          stamp_enabled: true,
          stamp_amount: round3(n(stampAmount)),

          subtotal_ht: totals.subtotal_ht,
          total_vat: totals.total_vat,
          total_ttc: totals.total_ttc,
          net_to_pay: totals.net_to_pay,
        };

        const upInv = await supabase.from("invoices").update(invPatch).eq("id", invoiceId);
        if (upInv.error) throw new Error(upInv.error.message);

        const del = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
        if (del.error) throw new Error(del.error.message);

        const ins = await supabase.from("invoice_items").insert(
          cleanItems.map((it) => ({
            invoice_id: invoiceId,
            ...it,
          })),
        );
        if (ins.error) throw new Error(ins.error.message);

        router.push(`/invoices/${invoiceId}`);
        router.refresh();
      } catch (e: any) {
        alert(e?.message || "Erreur sauvegarde.");
      }
    });
  }

  return (
    <div className="ftn-page">
      <div className="ftn-card">
        <div className="ftn-card-header">
          <div className="ftn-row" style={{ gap: 10, flexWrap: "wrap" }}>
            <button className="ftn-btn" onClick={() => router.push(`/invoices/${invoiceId}`)} disabled={pending}>
              Retour
            </button>
            <button className="ftn-btn ftn-btn-primary" onClick={onSave} disabled={pending}>
              Enregistrer
            </button>
          </div>
        </div>

        <div className="ftn-card-content">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-[var(--muted)]">Date</div>
              <input className="ftn-input w-full" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Numéro</div>
              <input className="ftn-input w-full" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Devise</div>
              <input className="ftn-input w-full" value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <div className="text-xs text-[var(--muted)]">Nom client</div>
              <input className="ftn-input w-full" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">MF</div>
              <input className="ftn-input w-full" value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Email</div>
              <input className="ftn-input w-full" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Téléphone</div>
              <input className="ftn-input w-full" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-[var(--muted)]">Adresse</div>
              <input className="ftn-input w-full" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-[var(--muted)]">Timbre</div>
              <input className="ftn-input w-full" type="number" step="0.001" value={String(stampAmount)} onChange={(e) => setStampAmount(n(e.target.value))} />
            </div>
            <div className="md:col-span-2 ftn-card p-4">
              <div className="text-sm font-medium">Totaux</div>
              <div className="mt-2 text-sm flex justify-between">
                <span className="text-[var(--muted)]">Total HT</span>
                <span className="font-medium">{fmt3(totals.subtotal_ht)}</span>
              </div>
              <div className="mt-1 text-sm flex justify-between">
                <span className="text-[var(--muted)]">Total TVA</span>
                <span className="font-medium">{fmt3(totals.total_vat)}</span>
              </div>
              <div className="mt-1 text-sm flex justify-between">
                <span className="text-[var(--muted)]">Timbre</span>
                <span className="font-medium">{fmt3(totals.stamp)}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-[var(--border)] text-sm flex justify-between">
                <span className="font-semibold">Net à payer</span>
                <span className="font-semibold">{fmt3(totals.net_to_pay)}</span>
              </div>
            </div>
          </div>

          <div className="mt-6 ftn-card p-4">
            <div className="ftn-row" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div className="text-sm font-medium">Lignes</div>
              <button className="ftn-btn" onClick={addLine} disabled={pending}>
                + Ajouter ligne
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="ftn-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th>Description</th>
                    <th style={{ width: 110 }}>Qté</th>
                    <th style={{ width: 140 }}>PU HT</th>
                    <th style={{ width: 120 }}>Remise%</th>
                    <th style={{ width: 110 }}>TVA%</th>
                    <th style={{ width: 120 }} />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((it, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>
                        <input className="ftn-input w-full" value={it.description} onChange={(e) => updateLine(idx, "description", e.target.value)} />
                      </td>
                      <td>
                        <input className="ftn-input w-full" type="number" step="0.001" value={String(it.quantity)} onChange={(e) => updateLine(idx, "quantity", n(e.target.value))} />
                      </td>
                      <td>
                        <input
                          className="ftn-input w-full"
                          type="number"
                          step="0.001"
                          value={String(it.unit_price_ht)}
                          onChange={(e) => updateLine(idx, "unit_price_ht", n(e.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          className="ftn-input w-full"
                          type="number"
                          step="0.001"
                          value={String(it.discount_pct)}
                          onChange={(e) => updateLine(idx, "discount_pct", n(e.target.value))}
                        />
                      </td>
                      <td>
                        <input className="ftn-input w-full" type="number" step="0.001" value={String(it.vat_pct)} onChange={(e) => updateLine(idx, "vat_pct", n(e.target.value))} />
                      </td>
                      <td>
                        <button className="ftn-btn" onClick={() => removeLine(idx)} disabled={pending || lines.length <= 1}>
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-[var(--muted)]">Le net à payer = (HT - remise) + TVA + timbre.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
