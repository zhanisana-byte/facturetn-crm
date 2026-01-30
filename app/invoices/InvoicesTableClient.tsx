"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string };

type InvoiceRow = {
  id: string;
  company_id: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  total_ttc: number | null;

  document_type: string | null; // facture | devis | avoir
  invoice_mode: string | null;  // normal | permanente
  status: string | null;

  created_by_user_id: string | null;
};

type AppUser = {
  id: string;
  full_name: string | null;
  email: string;
};

function pillLabel(type: string | null, mode: string | null) {
  // Mode permanente => on affiche "Permanente"
  if (mode === "permanente") return "Permanente";
  if (!type) return "—";
  // type = facture|devis|avoir
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function displayUser(u: AppUser | undefined) {
  if (!u) return "—";
  return u.full_name?.trim() ? u.full_name : u.email;
}

export default function InvoicesTableClient({
  companies,
  membershipsError,
}: {
  companies: Company[];
  membershipsError: string | null;
}) {
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

  // ✅ Filtres (simples)
  const [companyId, setCompanyId] = useState<string>("all");
  const [docType, setDocType] = useState<string>("all"); // facture|devis|avoir
  const [createdBy, setCreatedBy] = useState<string>("all"); // user_id
  const [q, setQ] = useState<string>(""); // invoice number search

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const companyName = useMemo(() => {
    const map = new Map(companies.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [companies]);

  async function ensureAuth() {
    if (!supabase) return { ok: false as const, error: "Supabase non configuré." };

    const { data: s, error: authErr } = await supabase.auth.getSession();
    if (authErr || !s.session?.user) {
      router.push("/login");
      return { ok: false as const, error: "Non connecté." };
    }
    return { ok: true as const };
  }

  async function load() {
    setErr(null);
    setLoading(true);

    const auth = await ensureAuth();
    if (!auth.ok) {
      setErr(auth.error);
      setLoading(false);
      return;
    }

    if (!companies.length) {
      setRows([]);
      setUsersMap(new Map());
      setLoading(false);
      return;
    }

    const companyIds = companies.map((c) => c.id);

    // ✅ On charge TOUT par défaut (toutes les factures)
    let query = supabase!
      .from("invoices")
      .select(
        "id,company_id,invoice_number,issue_date,total_ttc,document_type,invoice_mode,status,created_by_user_id"
      )
      .in("company_id", companyIds)
      .order("created_at", { ascending: false })
      .limit(300);

    // filtres server-side (rapides)
    if (companyId !== "all") query = query.eq("company_id", companyId);
    if (docType !== "all") query = query.eq("document_type", docType);
    if (createdBy !== "all") query = query.eq("created_by_user_id", createdBy);

    const { data, error } = await query;
    if (error) {
      setErr(error.message);
      setRows([]);
      setUsersMap(new Map());
      setLoading(false);
      return;
    }

    let list = ((data ?? []) as InvoiceRow[]).map((r) => ({
      ...r,
      invoice_number: r.invoice_number ?? null,
    }));

    // filtre client-side simple (recherche N°)
    const qq = q.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) =>
        String(r.invoice_number ?? "").toLowerCase().includes(qq)
      );
    }

    // ✅ Charger les auteurs (app_users) en une seule requête
    const ids = Array.from(
      new Set(list.map((r) => r.created_by_user_id).filter(Boolean) as string[])
    );

    const map = new Map<string, AppUser>();
    if (ids.length) {
      const { data: u, error: uErr } = await supabase!
        .from("app_users")
        .select("id,full_name,email")
        .in("id", ids);

      if (!uErr && u) {
        for (const item of u as AppUser[]) map.set(item.id, item);
      }
    }

    setUsersMap(map);
    setRows(list);
    setLoading(false);
  }

  async function deleteInvoice(id: string) {
    if (deletingId) return;
    const ok = confirm("Supprimer cette facture définitivement ?");
    if (!ok) return;

    setDeletingId(id);
    setErr(null);

    const r = await fetch(`/invoices/${id}/delete`, {
      method: "POST",
    }).catch(() => null);

    if (!r || !r.ok) {
      const j = await r?.json().catch(() => ({} as any));
      setErr(j?.error || "Erreur lors de la suppression.");
      setDeletingId(null);
      return;
    }

    setDeletingId(null);
    await load();
  }

  // ✅ Load initial + reload sur filtres
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, docType, createdBy]);

  return (
    <div className="ftn-card">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-lg font-semibold">Factures</div>
            <div className="text-sm text-slate-600">
              Toutes les factures (normal + permanente) · Vue + suppression
            </div>
          </div>

          <div className="flex gap-2">
            <Link className="ftn-btn" href="/invoices/new" prefetch={false}>
              + Ajouter facture
            </Link>
            <button
              className="ftn-btn ftn-btn-ghost"
              type="button"
              onClick={() => load()}
            >
              Rafraîchir
            </button>
          </div>
        </div>

        {membershipsError ? (
          <div className="ftn-alert">Accès sociétés : {membershipsError}</div>
        ) : null}
        {err ? <div className="ftn-alert">{err}</div> : null}

        {/* ✅ Filtrage UI propre (tableau/grille) */}
        <div className="rounded-xl border bg-white/60 p-3">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* Société */}
            <div className="md:col-span-3">
              <div className="text-xs text-slate-600 mb-1">Société</div>
              <select
                className="ftn-input w-full"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
              >
                <option value="all">Toutes les sociétés</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Type facture */}
            <div className="md:col-span-3">
              <div className="text-xs text-slate-600 mb-1">Type de facture</div>
              <select
                className="ftn-input w-full"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                <option value="all">Tous</option>
                <option value="facture">Facture</option>
                <option value="devis">Devis</option>
                <option value="avoir">Avoir</option>
              </select>
            </div>

            {/* Qui a créé */}
            <div className="md:col-span-3">
              <div className="text-xs text-slate-600 mb-1">Créée par</div>
              <select
                className="ftn-input w-full"
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value)}
              >
                <option value="all">Tous</option>
                {/* options dynamiques depuis la liste actuelle */}
                {Array.from(usersMap.values())
                  .sort((a, b) => displayUser(a).localeCompare(displayUser(b)))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {displayUser(u)}
                    </option>
                  ))}
              </select>
            </div>

            {/* Recherche */}
            <div className="md:col-span-3">
              <div className="text-xs text-slate-600 mb-1">Recherche</div>
              <input
                className="ftn-input w-full"
                placeholder="N° facture…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") load();
                }}
              />
            </div>

            {/* Actions filtre */}
            <div className="md:col-span-12 flex flex-wrap gap-2 justify-end">
              <button className="ftn-btn ftn-btn-ghost" type="button" onClick={() => load()}>
                Appliquer
              </button>
              <button
                className="ftn-btn ftn-btn-ghost"
                type="button"
                onClick={() => {
                  setCompanyId("all");
                  setDocType("all");
                  setCreatedBy("all");
                  setQ("");
                  // reload après reset
                  setTimeout(() => load(), 0);
                }}
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4">
        {loading ? (
          <div className="ftn-muted">Chargement...</div>
        ) : !rows.length ? (
          <div className="text-sm text-slate-600">Aucune facture.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b">
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3">N°</th>
                  <th className="py-2 pr-3">Société</th>
                  <th className="py-2 pr-3">Créée par</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Total TTC</th>
                  <th className="py-2 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((inv) => {
                  const author =
                    inv.created_by_user_id ? usersMap.get(inv.created_by_user_id) : undefined;

                  return (
                    <tr key={inv.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">
                        <span className="ftn-pill">{pillLabel(inv.document_type, inv.invoice_mode)}</span>
                      </td>
                      <td className="py-2 pr-3 font-medium">{inv.invoice_number ?? "—"}</td>
                      <td className="py-2 pr-3">{companyName(inv.company_id)}</td>
                      <td className="py-2 pr-3">{displayUser(author)}</td>
                      <td className="py-2 pr-3">{inv.issue_date ?? "—"}</td>
                      <td className="py-2 pr-3">{Number(inv.total_ttc ?? 0).toFixed(3)}</td>

                      <td className="py-2 pr-0">
                        <div className="flex flex-wrap gap-2 justify-end">
                          <Link
                            className="ftn-btn ftn-btn-ghost"
                            href={`/invoices/${inv.id}`}
                            prefetch={false}
                          >
                            Voir
                          </Link>

                          <button
                            className="ftn-btn ftn-btn-ghost"
                            type="button"
                            disabled={deletingId === inv.id}
                            onClick={() => deleteInvoice(inv.id)}
                            title="Supprimer"
                          >
                            {deletingId === inv.id ? "Suppression..." : "Supprimer"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
