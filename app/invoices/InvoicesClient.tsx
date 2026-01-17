"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

type InvoiceRow = {
  id: string;
  company_id: string;
  invoice_number: string | null;
  issue_date: string;
  total_ttc: number | null;
  status: string | null;
  ttn_status: string | null;
  customer_id: string | null;
};

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export default function InvoicesClient({ companyId }: { companyId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        setErr("Non authentifié.");
        setLoading(false);
        return;
      }

      // ✅ IMPORTANT: type the select
      const { data, error } = await supabase
        .from("invoices")
        .select("id,company_id,invoice_number,issue_date,total_ttc,status,ttn_status,customer_id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .returns<InvoiceRow[]>();

      if (error) throw new Error(error.message);

      setRows(data ?? []);
      setLoading(false);
    } catch (e: any) {
      setErr(e?.message ?? "Erreur lors du chargement des factures.");
      setRows([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const filtered = rows.filter((r) => {
    const s = `${r.invoice_number ?? ""}`.toLowerCase();
    const qq = q.trim().toLowerCase();
    if (!qq) return true;
    return s.includes(qq);
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Factures</h2>
        <Link
          href={`/invoices/new?company=${companyId}`}
          className="px-3 py-2 rounded-md bg-black text-white text-sm"
        >
          Nouvelle facture
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <input
          className="w-full px-3 py-2 rounded-md border"
          placeholder="Rechercher par numéro…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="px-3 py-2 rounded-md border text-sm"
          onClick={load}
          disabled={loading}
        >
          Rafraîchir
        </button>
      </div>

      {err && (
        <div className="text-sm rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-600">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-slate-600">Aucune facture.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Numéro</th>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Total TTC</th>
                <th className="py-2 pr-3">Statut</th>
                <th className="py-2 pr-3">TTN</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-2 pr-3">{r.invoice_number ?? "-"}</td>
                  <td className="py-2 pr-3">{r.issue_date}</td>
                  <td className="py-2 pr-3">{money(r.total_ttc)}</td>
                  <td className="py-2 pr-3">{r.status ?? "-"}</td>
                  <td className="py-2 pr-3">{r.ttn_status ?? "-"}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/invoices/${r.id}`} className="text-blue-600 hover:underline">
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
