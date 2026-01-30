"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string };
type AppUser = { id: string; full_name: string | null; email: string | null };

type InvoiceRow = {
  id: string;
  company_id: string;

  issue_date: string | null;
  invoice_number: string | null;

  // “Renommer”
  unique_reference: string | null;

  document_type: string | null; // facture | devis | avoir
  invoice_mode: string | null; // normal | permanente

  subtotal_ht: number | null;
  total_vat: number | null;
  total_ttc: number | null;
  currency: string | null;

  created_by_user_id: string | null;

  ttn_status: string | null;
};

function typeLabel(r: InvoiceRow) {
  const t = (r.document_type || "").toLowerCase();
  const m = (r.invoice_mode || "").toLowerCase();
  const mode = m === "permanente" ? "Permanente" : "Normale";

  if (t === "devis") return `Devis • ${mode}`;
  if (t === "avoir") return `Avoir • ${mode}`;
  return `Facture • ${mode}`;
}

function ttnPill(ttnStatus: string | null) {
  const s = (ttnStatus || "not_sent").toLowerCase();
  if (s === "accepted" || s === "accepte" || s === "accepté") return "Accepté";
  if (s === "rejected" || s === "rejete" || s === "rejeté") return "Rejeté";
  if (s === "submitted" || s === "soumis") return "Soumis";
  if (s === "scheduled" || s === "programme" || s === "programmé") return "Programmé";
  return "Non envoyé";
}

export default function InvoicesClient({
  companies,
  accountType,
}: {
  companies: Company[];
  accountType?: string;
}) {
  const supabase = createClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, AppUser>>(new Map());

  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      // Invoices
      const { data: inv, error: invErr } = await supabase
        .from("invoices")
        .select(
          "id,company_id,issue_date,invoice_number,unique_reference,document_type,invoice_mode,subtotal_ht,total_vat,total_ttc,currency,created_by_user_id,ttn_status"
        )
        .order("created_at", { ascending: false })
        .limit(400);

      if (invErr) throw invErr;

      const invoices = (inv ?? []) as InvoiceRow[];
      setRows(invoices);

      // Users map
      const ids = Array.from(new Set(invoices.map((x) => x.created_by_user_id).filter(Boolean))) as string[];
      if (!ids.length) {
        setUsersMap(new Map());
        return;
      }

      const { data: u, error: uErr } = await supabase
        .from("app_users")
        .select("id,full_name,email")
        .in("id", ids);

      if (uErr) throw uErr;

      const map = new Map<string, AppUser>();
      for (const it of (u ?? []) as any[]) map.set(it.id, it);
      setUsersMap(map);
    } catch (e: any) {
      setErr(e?.message ?? "Erreur chargement factures.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const d = (r.issue_date || "").slice(0, 10);
      if (d.length === 10) set.add(d.slice(0, 7)); // YYYY-MM
    }
    return Array.from(set).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (companyFilter !== "all" && r.company_id !== companyFilter) return false;

      if (monthFilter !== "all") {
        const d = (r.issue_date || "").slice(0, 10);
        if (!d || d.slice(0, 7) !== monthFilter) return false;
      }

      if (!term) return true;

      const comp = (companyName.get(r.company_id) ?? "").toLowerCase();
      const ren = (r.unique_reference ?? "").toLowerCase();
      const num = (r.invoice_number ?? "").toLowerCase();
      const typ = typeLabel(r).toLowerCase();

      return comp.includes(term) || ren.includes(term) || num.includes(term) || typ.includes(term);
    });
  }, [rows, q, companyFilter, monthFilter, companyName]);

  async function onDelete(id: string) {
    if (!confirm("Supprimer cette facture ?")) return;
    try {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
      await load();
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Erreur suppression.");
    }
  }

  function displayUser(uid: string | null) {
    if (!uid) return "—";
    const u = usersMap.get(uid);
    if (!u) return "—";
    return u.full_name || u.email || "—";
  }

  return (
    <div className="ftn-page">
      <div className="ftn-card">
        <div className="text-2xl font-semibold">Factures</div>
        <div className="text-sm text-slate-500">
          Facture / Devis / Avoir / Permanente — avec suivi TTN (programmé, soumis, accepté, rejeté).
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <Link href="/invoices/new" className="ftn-btn">
            + Ajouter facture
          </Link>

          <Link href="/recurring" className="ftn-btn ftn-btn-ghost">
            Factures permanentes
          </Link>

          <Link href="/declarations" className="ftn-btn ftn-btn-ghost">
            Déclarations
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <select className="ftn-input" value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="all">Toutes les sociétés</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select className="ftn-input" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="all">Tous les mois</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <input
            className="ftn-input flex-1 min-w-[220px]"
            placeholder="Recherche (société, renommer, numéro, type...)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{err}</div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-2xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left font-medium px-4 py-3">Société</th>
                <th className="text-left font-medium px-4 py-3">Renommer</th>
                <th className="text-left font-medium px-4 py-3">Type</th>
                <th className="text-left font-medium px-4 py-3">Créé par</th>
                <th className="text-left font-medium px-4 py-3">TTN</th>
                <th className="text-right font-medium px-4 py-3 w-[280px]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    Chargement...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    Aucune facture.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{companyName.get(r.company_id) ?? "Société"}</div>
                      <div className="text-xs text-slate-500">{r.issue_date ?? ""}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.unique_reference || "—"}</div>
                      <div className="text-xs text-slate-500">{r.invoice_number ?? ""}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="ftn-pill">{typeLabel(r)}</span>
                      <div className="text-xs text-slate-500 mt-1">
                        {Number(r.total_ttc ?? 0).toFixed(3)} {r.currency ?? "TND"}
                      </div>
                    </td>

                    <td className="px-4 py-3">{displayUser(r.created_by_user_id)}</td>

                    <td className="px-4 py-3">
                      <span className="ftn-pill">{ttnPill(r.ttn_status)}</span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-end whitespace-nowrap">
                        <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${r.id}`} prefetch={false}>
                          Voir
                        </Link>

                        <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${r.id}?edit=1`} prefetch={false}>
                          Modifier
                        </Link>

                        <button className="ftn-btn" onClick={() => onDelete(r.id)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
