"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string };
type AppUser = { id: string; full_name: string | null; email: string | null };

type Row = {
  id: string;
  company_id: string;

  issue_date: string | null;
  invoice_number: string | null;
  unique_reference: string | null;

  document_type: string | null;
  invoice_mode: string | null;

  customer_name: string | null;
  customer_email: string | null;
  customer_tax_id: string | null;

  subtotal_ht: number | null;
  total_vat: number | null;
  total_ttc: number | null;
  currency: string | null;

  created_by_user_id: string | null;

  signature_status: string | null;
  signed_at: string | null; // ✅ depuis invoice_signatures

  ttn_status: string | null;
  ttn_scheduled_at: string | null;

  declaration_status: string | null;
  declared_at: string | null;
  declaration_ref: string | null;
};

function fmt3(v: any) {
  const x = Number(v ?? 0);
  const n = Number.isFinite(x) ? x : 0;
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

function docTypeLabel(r: Row) {
  const t = (r.document_type || "facture").toLowerCase();
  if (t === "devis") return "Devis";
  if (t === "avoir") return "Avoir";
  return "Facture";
}

function isSigned(r: Row) {
  const st = (r.signature_status || "").toLowerCase();
  return st === "signed" || !!r.signed_at;
}

function ttnPill(ttnStatus: string | null) {
  const s = (ttnStatus || "not_sent").toLowerCase();
  if (s === "accepted") return { label: "Accepté", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (s === "rejected") return { label: "Rejeté", cls: "border-rose-200 bg-rose-50 text-rose-700" };
  if (s === "submitted") return { label: "Soumis", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  if (s === "scheduled") return { label: "Programmé", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  return { label: "Non envoyé", cls: "border-slate-200 bg-slate-50 text-slate-700" };
}

function declarationPill(r: Row) {
  const ttn = (r.ttn_status || "").toLowerCase();
  if (ttn === "accepted") return { label: "API", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" };

  const s = (r.declaration_status || "none").toLowerCase();
  if (s === "manual") return { label: "Manuel", cls: "border-slate-200 bg-slate-50 text-slate-700" };
  if (s === "auto") return { label: "API", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  if (s === "scheduled") return { label: "Programmé", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  return { label: "Non déclaré", cls: "border-slate-200 bg-slate-50 text-slate-700" };
}

function canReschedule(r: Row) {
  const st = (r.ttn_status || "").toLowerCase();
  return isSigned(r) && st === "scheduled";
}

function parseDateTimeInput(input: string) {
  const v = (input || "").trim();
  if (!v) return null;
  const normalized = v.includes("T") ? v : v.replace(" ", "T");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return null;
  return d;
}

export default function DeclarationsClient({ companies }: { companies: Company[] }) {
  const supabase = createClient();
  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, AppUser>>(new Map());

  const [companyId, setCompanyId] = useState("all");
  const [docType, setDocType] = useState("all");
  const [createdBy, setCreatedBy] = useState("all");
  const [client, setClient] = useState("");
  const [statusTTN, setStatusTTN] = useState("all");
  const [declType, setDeclType] = useState("all");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [q, setQ] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 25;

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          [
            "id",
            "company_id",
            "issue_date",
            "invoice_number",
            "unique_reference",
            "document_type",
            "invoice_mode",
            "customer_name",
            "customer_email",
            "customer_tax_id",
            "subtotal_ht",
            "total_vat",
            "total_ttc",
            "currency",
            "created_by_user_id",
            "signature_status",
            // ⚠️ signed_at n'existe pas dans invoices
            "ttn_status",
            "ttn_scheduled_at",
            "declaration_status",
            "declared_at",
            "declaration_ref",
          ].join(","),
        )
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;

      const all = (data ?? []) as Row[];

      // ✅ récupérer signed_at depuis invoice_signatures
      const invIds = Array.from(new Set(all.map((x) => x.id).filter(Boolean))) as string[];
      if (invIds.length) {
        const { data: sigs, error: sigErr } = await supabase
          .from("invoice_signatures")
          .select("invoice_id,signed_at")
          .in("invoice_id", invIds);

        if (sigErr) throw sigErr;

        const sigMap = new Map<string, string | null>();
        for (const s of (sigs ?? []) as any[]) sigMap.set(String(s.invoice_id), s.signed_at ?? null);
        for (const r of all) (r as any).signed_at = sigMap.get(r.id) ?? null;
      }

      const declaredOnly = all.filter((r) => {
        const decl = (r.declaration_status || "").toLowerCase();
        const ttn = (r.ttn_status || "").toLowerCase();
        return (
          decl === "manual" ||
          decl === "auto" ||
          decl === "scheduled" ||
          !!r.declared_at ||
          ttn === "scheduled" ||
          ttn === "submitted" ||
          ttn === "accepted" ||
          ttn === "rejected"
        );
      });

      setRows(declaredOnly);

      const ids = Array.from(new Set(declaredOnly.map((x) => x.created_by_user_id).filter(Boolean))) as string[];
      if (!ids.length) {
        setUsersMap(new Map());
        return;
      }

      const { data: u, error: uErr } = await supabase.from("app_users").select("id,full_name,email").in("id", ids);
      if (uErr) throw uErr;

      const map = new Map<string, AppUser>();
      for (const it of (u ?? []) as any[]) map.set(it.id, it);
      setUsersMap(map);
    } catch (e: any) {
      setErr(e?.message ?? "Erreur chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const createdByOptions = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    usersMap.forEach((u, id) => list.push({ id, label: u.full_name || u.email || id }));
    return list.sort((a, b) => a.label.localeCompare(b.label));
  }, [usersMap]);

  function displayUser(uid: string | null) {
    if (!uid) return "—";
    const u = usersMap.get(uid);
    return u?.full_name || u?.email || "—";
  }

  const filtered = useMemo(() => {
    const tSearch = q.trim().toLowerCase();
    const tClient = client.trim().toLowerCase();

    const df = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const dt = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return rows.filter((r) => {
      if (companyId !== "all" && r.company_id !== companyId) return false;

      const dtp = (r.document_type || "facture").toLowerCase();
      if (docType !== "all" && dtp !== docType) return false;

      if (createdBy !== "all" && (r.created_by_user_id || "") !== createdBy) return false;

      const ttn = (r.ttn_status || "not_sent").toLowerCase();
      if (statusTTN !== "all" && ttn !== statusTTN) return false;

      const decl = declarationPill(r).label.toLowerCase();
      if (declType !== "all") {
        if (declType === "manual" && decl !== "manuel") return false;
        if (declType === "api" && decl !== "api") return false;
        if (declType === "scheduled" && decl !== "programmé") return false;
      }

      if (df || dt) {
        const base = r.declared_at || r.issue_date;
        const d = base ? new Date(`${base.slice(0, 10)}T12:00:00`) : null;
        if (!d) return false;
        if (df && d < df) return false;
        if (dt && d > dt) return false;
      }

      if (tClient) {
        const cn = (r.customer_name || "").toLowerCase();
        const ce = (r.customer_email || "").toLowerCase();
        const mf = (r.customer_tax_id || "").toLowerCase();
        if (!(`${cn} ${ce} ${mf}`.includes(tClient))) return false;
      }

      if (!tSearch) return true;

      const comp = (companyName.get(r.company_id) || "").toLowerCase();
      const ref = (r.unique_reference || "").toLowerCase();
      const no = (r.invoice_number || "").toLowerCase();
      const cl = (r.customer_name || "").toLowerCase();

      return comp.includes(tSearch) || ref.includes(tSearch) || no.includes(tSearch) || cl.includes(tSearch);
    });
  }, [rows, companyId, docType, createdBy, statusTTN, declType, dateFrom, dateTo, client, q, companyName]);

  useEffect(() => setPage(1), [companyId, docType, createdBy, statusTTN, declType, dateFrom, dateTo, client, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe]);

  async function reschedule(r: Row) {
    if (!canReschedule(r)) return;

    const current = r.ttn_scheduled_at ? new Date(r.ttn_scheduled_at) : null;
    const currentLabel = current ? current.toISOString().slice(0, 16).replace("T", " ") : "";

    const input = window.prompt("Nouvelle date (ex: 2026-02-01 10:30)", currentLabel);
    if (input === null) return;

    const d = parseDateTimeInput(input);
    if (!d) {
      alert("Format invalide.");
      return;
    }

    try {
      const iso = d.toISOString();
      const { error: qErr } = await supabase
        .from("ttn_invoice_queue")
        .update({ status: "scheduled", scheduled_at: iso, canceled_at: null })
        .eq("invoice_id", r.id);
      if (qErr) throw qErr;

      const { error: invErr } = await supabase
        .from("invoices")
        .update({ ttn_status: "scheduled", ttn_scheduled_at: iso })
        .eq("id", r.id);
      if (invErr) throw invErr;

      await load();
    } catch (e: any) {
      alert(e?.message || "Erreur reprogrammation.");
    }
  }

  function resetFilters() {
    setCompanyId("all");
    setDocType("all");
    setCreatedBy("all");
    setClient("");
    setStatusTTN("all");
    setDeclType("all");
    setDateFrom("");
    setDateTo("");
    setQ("");
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="ftn-card p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Déclarations</div>
            <div className="text-sm text-slate-600">Liste des factures déclarées (manuel, API, programmé) et suivi TTN.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="ftn-btn ftn-btn-ghost" href="/invoices" prefetch={false}>
              Documents
            </Link>
            <button className="ftn-btn" onClick={() => load()} disabled={loading}>
              Actualiser
            </button>
          </div>
        </div>

        {/* ✅ 2 lignes / petites colonnes comme Factures */}
        <div className="decl-grid" style={{ marginTop: 16 }}>
          {/* ligne 1 */}
          <select className="ftn-input decl-span-2" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="all">Toutes les sociétés</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select className="ftn-input" value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="all">Type : tout</option>
            <option value="facture">Facture</option>
            <option value="devis">Devis</option>
            <option value="avoir">Avoir</option>
          </select>

          <select className="ftn-input" value={declType} onChange={(e) => setDeclType(e.target.value)}>
            <option value="all">Déclaration : tout</option>
            <option value="manual">Manuel</option>
            <option value="api">API</option>
            <option value="scheduled">Programmé</option>
          </select>

          <select className="ftn-input" value={statusTTN} onChange={(e) => setStatusTTN(e.target.value)}>
            <option value="all">TTN : tout</option>
            <option value="scheduled">Programmé</option>
            <option value="submitted">Soumis</option>
            <option value="accepted">Accepté</option>
            <option value="rejected">Rejeté</option>
            <option value="not_sent">Non envoyé</option>
          </select>

          {/* ligne 2 */}
          <select className="ftn-input decl-span-2" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
            <option value="all">Créé par : tout</option>
            {createdByOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>

          <input className="ftn-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Du" />
          <input className="ftn-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Au" />

          <input className="ftn-input decl-span-1" placeholder="Client (nom/email/MF)" value={client} onChange={(e) => setClient(e.target.value)} />
        </div>

        {/* ✅ ligne recherche + boutons (même esprit que Factures) */}
        <div className="decl-search-row">
          <input className="ftn-input" placeholder="Recherche (société, numéro, référence…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="ftn-btn" onClick={resetFilters} disabled={loading}>
            Réinitialiser
          </button>
          <button className="ftn-btn ftn-btn-primary" onClick={() => load()} disabled={loading}>
            Actualiser
          </button>
        </div>

        {err ? <div className="mt-3 ftn-alert">{err}</div> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="ftn-table min-w-[1300px]">
            <thead>
              <tr>
                <th>Société</th>
                <th>Client</th>
                <th>Type</th>
                <th>Date</th>
                <th>Montant</th>
                <th>Créé par</th>
                <th>Signé</th>
                <th>Déclaration</th>
                <th>TTN</th>
                <th>Planification</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500">
                    Chargement…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500">
                    Aucun résultat.
                  </td>
                </tr>
              ) : (
                paged.map((r) => {
                  const decl = declarationPill(r);
                  const ttn = ttnPill(r.ttn_status);
                  const signed = isSigned(r);

                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        <div className="font-medium">{companyName.get(r.company_id) ?? "—"}</div>
                        <div className="text-xs text-slate-500">{r.invoice_number || r.unique_reference || "—"}</div>
                      </td>

                      <td className="whitespace-nowrap">
                        <div className="font-medium">{r.customer_name || "—"}</div>
                        <div className="text-xs text-slate-500">{r.customer_email || r.customer_tax_id || "—"}</div>
                      </td>

                      <td className="whitespace-nowrap">{docTypeLabel(r)}</td>

                      <td className="whitespace-nowrap">
                        <div className="text-sm">{r.declared_at ? r.declared_at.slice(0, 10) : r.issue_date ? r.issue_date : "—"}</div>
                      </td>

                      <td className="whitespace-nowrap">
                        {fmt3(r.total_ttc)} {r.currency || "TND"}
                      </td>

                      <td className="whitespace-nowrap">{displayUser(r.created_by_user_id)}</td>

                      <td className="whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${signed ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                          {signed ? "Oui" : "Non"}
                        </span>
                      </td>

                      <td className="whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${decl.cls}`}>{decl.label}</span>
                        <div className="text-xs text-slate-500">{r.declaration_ref ? `Ref: ${r.declaration_ref}` : "—"}</div>
                      </td>

                      <td className="whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${ttn.cls}`}>{ttn.label}</span>
                      </td>

                      <td className="whitespace-nowrap">
                        <div className="text-sm">{r.ttn_scheduled_at ? r.ttn_scheduled_at.slice(0, 16).replace("T", " ") : "—"}</div>
                      </td>

                      <td className="whitespace-nowrap text-right">
                        <div className="inline-flex gap-2">
                          <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${r.id}`} prefetch={false}>
                            Ouvrir
                          </Link>
                          <button className="ftn-btn" disabled={!canReschedule(r)} onClick={() => reschedule(r)} title={!canReschedule(r) ? "Reprogrammation possible uniquement si signée et TTN=Programmé" : ""}>
                            Reprogrammer
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="ftn-pagination mt-4">
          <div className="ftn-muted">
            Page {pageSafe} / {totalPages} • {filtered.length} document(s)
          </div>
          <div className="ftn-row" style={{ gap: 10 }}>
            <button className="ftn-btn" onClick={() => setPage(1)} disabled={pageSafe <= 1}>
              Début
            </button>
            <button className="ftn-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}>
              Précédent
            </button>
            <button className="ftn-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={pageSafe >= totalPages}>
              Suivant
            </button>
            <button className="ftn-btn" onClick={() => setPage(totalPages)} disabled={pageSafe >= totalPages}>
              Fin
            </button>
          </div>
        </div>
      </div>

      {/* ✅ CSS local : même logique que Factures */}
      <style jsx>{`
        .decl-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
          align-items: center;
        }
        .decl-span-2 {
          grid-column: span 2;
        }

        .decl-search-row {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 10px;
          align-items: center;
        }

        @media (max-width: 1200px) {
          .decl-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
          .decl-span-2 {
            grid-column: span 2;
          }
        }

        @media (max-width: 900px) {
          .decl-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .decl-span-2 {
            grid-column: span 2;
          }
          .decl-search-row {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .decl-grid {
            grid-template-columns: 1fr;
          }
          .decl-span-2 {
            grid-column: span 1;
          }
        }
      `}</style>
    </div>
  );
}
