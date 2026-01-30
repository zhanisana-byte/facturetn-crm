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

  // ✅ “Renommer” -> unique_reference (usage interne)
  unique_reference: string | null;

  document_type: string | null; // facture | devis | avoir
  invoice_mode: string | null;  // normal | permanente

  subtotal_ht: number | null;
  total_vat: number | null;
  total_ttc: number | null;
  currency: string | null;

  created_by_user_id: string | null;

  // TTN
  ttn_status: string | null; // not_sent|scheduled|submitted|accepted|rejected|canceled
  ttn_reference: string | null;
  ttn_scheduled_at: string | null;
  ttn_validated_at: string | null;

  created_at: string | null;
};

function pill(text: string, tone: "ok" | "warn" | "bad" | "neutral" = "neutral") {
  const cls =
    tone === "ok"
      ? "border-emerald-300/60 bg-emerald-100/40"
      : tone === "warn"
      ? "border-amber-300/60 bg-amber-100/40"
      : tone === "bad"
      ? "border-rose-300/60 bg-rose-100/40"
      : "border-slate-200/80 bg-white/40";
  return <span className={`ftn-pill ${cls}`}>{text}</span>;
}

function docLabel(doc: string | null) {
  const d = (doc || "").toLowerCase();
  if (d.includes("devis")) return "Devis";
  if (d.includes("avoir")) return "Avoir";
  return "Facture";
}

function modeLabel(m: string | null) {
  return (m || "").toLowerCase().includes("perman") ? "Permanente" : "Normale";
}

function ttnLabel(i: InvoiceRow) {
  const s = (i.ttn_status || "").toLowerCase();
  if (s === "accepted") return pill("TTN accepté", "ok");
  if (s === "rejected") return pill("TTN rejeté", "bad");
  if (s === "submitted") return pill("Envoyé TTN", "warn");
  if (s === "scheduled") return pill("Programmé", "warn");
  if (s === "canceled") return pill("Annulé", "neutral");
  return pill("Non envoyé", "neutral");
}

function displayUser(u?: AppUser) {
  if (!u) return "—";
  return u.full_name?.trim() ? u.full_name : u.email ?? "—";
}

export default function InvoicesClient({ companies }: { companies: Company[] }) {
  const router = useRouter();

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, AppUser>>(new Map());

  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  async function loadUsers(userIds: string[]) {
    if (!supabase) return;
    const unique = Array.from(new Set(userIds.filter(Boolean)));
    if (!unique.length) return;

    const { data } = await supabase.from("app_users").select("id,full_name,email").in("id", unique);
    const map = new Map<string, AppUser>();
    (data as any[] | null)?.forEach((u) => map.set(String(u.id), u as any));
    setUsersMap(map);
  }

  async function load() {
    setErr(null);
    setLoading(true);

    if (!supabase) {
      setErr("Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
      setLoading(false);
      return;
    }

    const ids = companies.map((c) => c.id);
    if (!ids.length) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id,company_id,issue_date,invoice_number,unique_reference,document_type,invoice_mode,subtotal_ht,total_vat,total_ttc,currency,created_by_user_id,ttn_status,ttn_reference,ttn_scheduled_at,ttn_validated_at,created_at"
      )
      .in("company_id", ids)
      .order("created_at", { ascending: false })
      .limit(600);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const list = ((data as any) ?? []) as InvoiceRow[];
    setRows(list);

    await loadUsers(list.map((x) => x.created_by_user_id || "").filter(Boolean));

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies.map((c) => c.id).join(",")]);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (companyFilter !== "all" && r.company_id !== companyFilter) return false;
      if (!term) return true;

      const inSoc = (companyName.get(r.company_id) || "").toLowerCase();
      const inName = (r.unique_reference || "").toLowerCase();
      const inNo = (r.invoice_number || "").toLowerCase();
      const inType = (r.document_type || "").toLowerCase();

      return inSoc.includes(term) || inName.includes(term) || inNo.includes(term) || inType.includes(term);
    });
  }, [rows, q, companyFilter, companyName]);

  async function deleteInvoice(id: string) {
    if (!confirm("Supprimer cette facture ?")) return;
    setErr(null);

    try {
      // on interdit delete si déjà accepté TTN
      const current = rows.find((x) => x.id === id);
      const ttn = (current?.ttn_status || "").toLowerCase();
      if (ttn === "accepted") {
        alert("Impossible : facture déjà validée/acceptée par TTN.");
        return;
      }

      const res = await fetch(`/invoices/${id}/delete`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e: any) {
      setErr(e?.message || "Erreur suppression.");
    }
  }

  return (
    <div className="p-6">
      <div className="ftn-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Factures</h2>
            <p className="text-slate-600 mt-1">
              Facture / Devis / Avoir / Permanente — avec suivi TTN (programmé, soumis, accepté, rejeté).
            </p>
          </div>

          <div className="flex gap-2">
            <Link className="ftn-btn" href="/invoices/new" prefetch={false}>
              + Ajouter facture
            </Link>
            <Link className="ftn-btn ftn-btn-ghost" href="/recurring" prefetch={false}>
              Factures permanentes
            </Link>
            <Link className="ftn-btn ftn-btn-ghost" href="/declarations" prefetch={false}>
              Déclarations
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <select
            className="ftn-input"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="all">Toutes les sociétés</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{err}</div>
        ) : null}

        <div className="mt-5 overflow-auto rounded-2xl border">
          {loading ? (
            <div className="p-4 text-sm">Chargement...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-sm">Aucune facture.</div>
          ) : (
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
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{companyName.get(r.company_id) ?? "Société"}</div>
                      <div className="text-xs text-slate-500">{r.issue_date ?? ""}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium">{r.unique_reference || "—"}</div>
                      <div className="text-xs text-slate-500">{r.invoice_number || ""}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {pill(docLabel(r.document_type))}
                        {pill(modeLabel(r.invoice_mode))}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {displayUser(r.created_by_user_id ? usersMap.get(r.created_by_user_id) : undefined)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div>{ttnLabel(r)}</div>
                        {r.ttn_validated_at ? (
                          <div className="text-xs text-slate-500">
                            Validé: {new Date(r.ttn_validated_at).toLocaleString()}
                          </div>
                        ) : r.ttn_scheduled_at ? (
                          <div className="text-xs text-slate-500">
                            Programmé: {new Date(r.ttn_scheduled_at).toLocaleString()}
                          </div>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap gap-2 justify-end">
                        <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${r.id}`} prefetch={false}>
                          Voir
                        </Link>

                        {/* ✅ Modify via same screen */}
                        <Link className="ftn-btn" href={`/invoices/new?edit=${r.id}`} prefetch={false}>
                          Modifier
                        </Link>

                        <button className="ftn-btn ftn-btn-danger" onClick={() => deleteInvoice(r.id)}>
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 text-xs text-slate-500">
          Astuce : “Renommer” = <b>unique_reference</b> (référence interne), TTN = <b>ttn_status</b>.
        </div>
      </div>
    </div>
  );
}
