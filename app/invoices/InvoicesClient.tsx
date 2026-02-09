"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Invoice = {
  id: string;
  issue_date: string | null;
  signature_status: string | null;
  signed_at: string | null;
  currency: string | null;
  timbre: number | null;

  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_tax_id: string | null;
  customer_address: string | null;

  company_name: string | null;
  company_tax_id: string | null;
  company_address: string | null;
};

type Line = {
  id: string;
  description: string | null;
  qty: number | null;
  unit_price_ht: number | null;
  discount: number | null;
  vat_rate: number | null;
};

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function fmt(v: any) {
  return n(v).toFixed(3);
}

function calcTotals(lines: Line[], timbre: any) {
  let totalHT = 0;
  let totalTVA = 0;

  for (const l of lines) {
    const base = Math.max(0, n(l.qty) * n(l.unit_price_ht) - n(l.discount));
    totalHT += base;
    totalTVA += base * (n(l.vat_rate) / 100);
  }

  const stamp = n(timbre);
  const totalTTC = totalHT + totalTVA + stamp;

  return { totalHT, totalTVA, stamp, totalTTC };
}

export default function InvoiceClient() {
  const supabase = useMemo(() => createClient(), []);
  const params = useParams();
  const id = params?.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const { data: inv } = await supabase
        .from("invoices")
        .select(`
          id, issue_date, signature_status, signed_at, currency, timbre,
          customer_name, customer_email, customer_phone, customer_tax_id, customer_address,
          company_name, company_tax_id, company_address
        `)
        .eq("id", id)
        .single();

      const { data: lns } = await supabase
        .from("invoice_lines")
        .select("id, description, qty, unit_price_ht, discount, vat_rate")
        .eq("invoice_id", id)
        .order("id");

      setInvoice(inv as Invoice);
      setLines((lns ?? []) as Line[]);
      setLoading(false);
    }

    load();
  }, [id, supabase]);

  if (loading || !invoice) return <div className="p-6">Chargement…</div>;

  const signed = invoice.signature_status === "signed" || !!invoice.signed_at;
  const totals = calcTotals(lines, invoice.timbre);

  return (
    <div className="ftn-page">
      <div className="ftn-card">
        <div className="ftn-card-header">
          <div>
            <div className="ftn-card-title">Facture</div>
            <div className={`ftn-badge ${signed ? "ok" : "bad"}`}>
              {signed ? "Signée" : "Non signée"}
            </div>
          </div>
        </div>

        <div className="ftn-card-content">
          <div className="grid-2">
            <div className="box">
              <h4>Client</h4>
              <div>{invoice.customer_name}</div>
              <div>{invoice.customer_tax_id}</div>
              <div>{invoice.customer_email}</div>
              <div>{invoice.customer_phone}</div>
              <div>{invoice.customer_address}</div>
            </div>

            <div className="box">
              <h4>Vendeur</h4>
              <div>{invoice.company_name}</div>
              <div>{invoice.company_tax_id}</div>
              <div>{invoice.company_address}</div>
            </div>
          </div>

          <table className="ftn-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th>Qté</th>
                <th>PU HT</th>
                <th>Remise</th>
                <th>TVA%</th>
                <th>Total HT</th>
                <th>Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const base = Math.max(0, n(l.qty) * n(l.unit_price_ht) - n(l.discount));
                const tva = base * (n(l.vat_rate) / 100);
                return (
                  <tr key={l.id}>
                    <td>{i + 1}</td>
                    <td>{l.description}</td>
                    <td>{fmt(l.qty)}</td>
                    <td>{fmt(l.unit_price_ht)}</td>
                    <td>{fmt(l.discount)}</td>
                    <td>{fmt(l.vat_rate)}</td>
                    <td>{fmt(base)}</td>
                    <td>{fmt(base + tva)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="totals">
            <div><span>Total HT</span><span>{fmt(totals.totalHT)}</span></div>
            <div><span>Total TVA</span><span>{fmt(totals.totalTVA)}</span></div>
            <div><span>Timbre</span><span>{fmt(totals.stamp)}</span></div>
            <div className="grand">
              <span>Net à payer</span>
              <span>{fmt(totals.totalTTC)} {invoice.currency || "TND"}</span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 20px;
        }
        .box {
          background: #fff;
          padding: 16px;
          border-radius: 16px;
        }
        .totals {
          margin-top: 20px;
          max-width: 360px;
          margin-left: auto;
        }
        .totals div {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
        }
        .totals .grand {
          font-weight: 700;
          border-top: 1px solid #ddd;
          margin-top: 8px;
          padding-top: 8px;
        }
        .ftn-badge.ok {
          background: #22c55e;
          color: #fff;
          padding: 6px 12px;
          border-radius: 999px;
        }
        .ftn-badge.bad {
          background: #ef4444;
          color: #fff;
          padding: 6px 12px;
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}
