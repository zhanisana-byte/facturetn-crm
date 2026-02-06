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

export default function InvoiceSignatureSummaryClient({
  invoice,
  items,
}: {
  invoice: any;
  items: any[];
}) {
  const currency = s(invoice?.currency || "TND");

  const stampRaw = invoice?.stamp_amount ?? invoice?.stamp_duty;
  const stamp = stampRaw == null ? 1 : n(stampRaw);

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold">Résumé avant signature</div>
          <div className="text-sm text-slate-600 mt-1">
            Vérifiez la facture ci-dessous. La signature sera effectuée via DigiGo.
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link className="ftn-btn-ghost" href={`/invoices/${invoice.id}`}>
            Retour facture
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex flex-wrap gap-3 justify-between">
          <div>
            <div className="text-sm text-slate-500">Facture</div>
            <div className="font-semibold">{s(invoice.invoice_number || invoice.invoice_no || invoice.id)}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Client</div>
            <div className="font-medium">{s(invoice.customer_name || "—")}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">Date</div>
            <div className="font-medium">{s(invoice.issue_date || "—")}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
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
                    <td className="py-2">{s(it.description || "—")}</td>
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

        <div className="grid gap-2 sm:ml-auto sm:max-w-sm">
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
