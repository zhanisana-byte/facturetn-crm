"use client";

import Link from "next/link";
import DigigoSignButton from "@/components/DigigoSignButton";

function s(v: any) {
  return String(v ?? "").trim();
}
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function money(v: any, cur: string) {
  const x = n(v);
  return `${x.toFixed(3)} ${cur || "TND"}`;
}

function isMissing(v: any) {
  return !s(v);
}

function Field({
  label,
  value,
  required,
}: {
  label: string;
  value: any;
  required?: boolean;
}) {
  const missing = required && isMissing(value);
  return (
    <div className={`rounded-xl border p-3 ${missing ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white/60"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-500">{label}</div>
        {required ? (
          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${missing ? "border-rose-200 text-rose-800 bg-rose-100" : "border-slate-200 text-slate-600 bg-slate-50"}`}>
            Obligatoire
          </span>
        ) : null}
      </div>
      <div className={`mt-1 text-sm font-medium break-words ${missing ? "text-rose-900" : "text-slate-900"}`}>
        {s(value) || "—"}
      </div>
      {missing ? <div className="mt-1 text-xs text-rose-700">Champ requis pour la signature TTN.</div> : null}
    </div>
  );
}

export default function InvoiceSignatureSummaryClient({
  invoice,
  company,
  items,
}: {
  invoice: any;
  company: any | null;
  items: any[];
}) {
  const currency = s(invoice?.currency || "TND");

  const stampRaw = invoice?.stamp_amount ?? invoice?.stamp_duty;
  const stamp = stampRaw == null ? 1 : n(stampRaw);

  // Totaux
  let ht = 0;
  let tva = 0;
  for (const it of items || []) {
    const qty = n(it.quantity ?? 0);
    const pu = n(it.unit_price_ht ?? it.unit_price ?? 0);
    const vatPct = n(it.vat_pct ?? 0);
    const base = qty * pu;
    ht += base;
    tva += (base * vatPct) / 100;
  }
  const ttc = ht + tva + stamp;

  const invoiceNo = s(invoice?.invoice_number || invoice?.invoice_no || invoice?.id);
  const docType = s(invoice?.document_type || "facture");
  const issueDate = s(invoice?.issue_date || "—");
  const dueDate = s(invoice?.due_date || "—");

  // Vendeur (company table)
  const sellerName = s(company?.company_name || "");
  const sellerMf = s(company?.tax_id || company?.taxId || "");
  const sellerAdr = s(company?.address || "");
  const sellerCity = s(company?.city || "");
  const sellerZip = s(company?.postal_code || company?.zip || "");
  const sellerCountry = s(company?.country || "TN");

  // Client (invoice snapshot)
  const customerName = s(invoice?.customer_name || "");
  const customerMf = s(invoice?.customer_tax_id || "");
  const customerAdr = s(invoice?.customer_address || "");
  const customerEmail = s(invoice?.customer_email || "");
  const customerPhone = s(invoice?.customer_phone || "");

  // Mini résumé des manquants (pour guidance)
  const missingList: string[] = [];
  if (!sellerName) missingList.push("Nom société (vendeur)");
  if (!sellerMf) missingList.push("MF société (vendeur)");
  if (!sellerAdr) missingList.push("Adresse société (vendeur)");
  if (!customerName) missingList.push("Nom client");
  if (!customerMf) missingList.push("MF client");
  if (!customerAdr) missingList.push("Adresse client");
  if (!s(invoice?.issue_date)) missingList.push("Date facture");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-xl font-semibold">Résumé avant signature</div>
          <div className="text-sm text-slate-600 mt-1">
            Vérifiez toutes les informations. La signature sera effectuée via DigiGo (TEIF strict).
          </div>

          {missingList.length ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">Champs manquants (bloquants)</div>
              <div className="mt-1 text-amber-800">
                {missingList.join(" • ")}
              </div>
              <div className="mt-2 text-xs text-amber-700">
                Complétez ces champs dans la facture / client / société, puis relancez la signature.
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link className="ftn-btn-ghost" href={`/invoices/${invoice.id}`}>
            Retour facture
          </Link>
        </div>
      </div>

      {/* Cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Facture */}
        <div className="rounded-2xl border bg-white/70 p-5">
          <div className="text-sm text-slate-500">Facture</div>
          <div className="mt-1 text-base font-semibold break-words">{invoiceNo}</div>

          <div className="mt-4 grid gap-3">
            <Field label="Type" value={docType} />
            <Field label="Date facture" value={issueDate} required />
            <Field label="Échéance" value={dueDate} />
            <Field label="Devise" value={currency} />
          </div>
        </div>

        {/* Vendeur */}
        <div className="rounded-2xl border bg-white/70 p-5">
          <div className="text-sm text-slate-500">Vendeur (Ma société)</div>
          <div className="mt-1 text-base font-semibold break-words">{sellerName || "—"}</div>

          <div className="mt-4 grid gap-3">
            <Field label="Matricule fiscal (MF)" value={sellerMf} required />
            <Field label="Adresse" value={sellerAdr} required />
            <Field label="Ville" value={sellerCity} />
            <Field label="Code postal" value={sellerZip} />
            <Field label="Pays" value={sellerCountry} />
          </div>
        </div>

        {/* Client */}
        <div className="rounded-2xl border bg-white/70 p-5">
          <div className="text-sm text-slate-500">Client</div>
          <div className="mt-1 text-base font-semibold break-words">{customerName || "—"}</div>

          <div className="mt-4 grid gap-3">
            <Field label="Matricule fiscal (MF)" value={customerMf} required />
            <Field label="Adresse" value={customerAdr} required />
            <Field label="Email" value={customerEmail} />
            <Field label="Téléphone" value={customerPhone} />
          </div>
        </div>
      </div>

      {/* Lignes + Totaux + Action */}
      <div className="rounded-2xl border bg-white/70 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-base font-semibold">Détails</div>
          <div className="text-sm text-slate-600">{items?.length || 0} ligne(s)</div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="text-slate-600">
              <tr className="border-b">
                <th className="py-2 text-left">Désignation</th>
                <th className="py-2 text-right">Qté</th>
                <th className="py-2 text-right">PU HT</th>
                <th className="py-2 text-right">TVA</th>
                <th className="py-2 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {(items || []).map((it, idx) => {
                const qty = n(it.quantity ?? 0);
                const pu = n(it.unit_price_ht ?? it.unit_price ?? 0);
                const line = qty * pu;
                return (
                  <tr key={it.id || idx} className="border-b last:border-b-0">
                    <td className="py-2">
                      <div className="font-medium text-slate-900">{s(it.description || "—")}</div>
                    </td>
                    <td className="py-2 text-right">{qty}</td>
                    <td className="py-2 text-right">{money(pu, currency)}</td>
                    <td className="py-2 text-right">{n(it.vat_pct ?? 0).toFixed(0)}%</td>
                    <td className="py-2 text-right">{money(line, currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="grid gap-3 md:hidden">
          {(items || []).map((it, idx) => {
            const qty = n(it.quantity ?? 0);
            const pu = n(it.unit_price_ht ?? it.unit_price ?? 0);
            const vat = n(it.vat_pct ?? 0);
            const line = qty * pu;

            return (
              <div key={it.id || idx} className="rounded-xl border bg-white p-4">
                <div className="font-semibold text-slate-900 break-words">{s(it.description || "—")}</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="text-slate-600">Qté</div>
                  <div className="text-right font-medium">{qty}</div>

                  <div className="text-slate-600">PU HT</div>
                  <div className="text-right font-medium">{money(pu, currency)}</div>

                  <div className="text-slate-600">TVA</div>
                  <div className="text-right font-medium">{vat.toFixed(0)}%</div>

                  <div className="text-slate-600">Total HT</div>
                  <div className="text-right font-semibold">{money(line, currency)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="grid gap-2 sm:ml-auto sm:max-w-sm pt-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Total HT</span>
            <span className="font-medium">{money(ht, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">TVA</span>
            <span className="font-medium">{money(tva, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Timbre</span>
            <span className="font-medium">{money(stamp, currency)}</span>
          </div>
          <div className="flex items-center justify-between text-base border-t pt-2">
            <span className="font-semibold">Total TTC</span>
            <span className="font-semibold">{money(ttc, currency)}</span>
          </div>
        </div>

        {/* Action */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-slate-500">
            En cliquant sur “Signer”, vous serez redirigé vers DigiGo pour valider la signature.
          </div>
          <DigigoSignButton invoiceId={invoice.id} />
        </div>
      </div>
    </div>
  );
}
