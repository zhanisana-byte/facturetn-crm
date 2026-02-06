"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string };
type AppUser = { id: string; full_name: string | null; email: string | null };

type InvoiceRow = {
  id: string;
  company_id: string;

  issue_date: string | null;
  invoice_number: string | null;
  unique_reference: string | null;

  document_type: string | null;
  invoice_mode: string | null;

  subtotal_ht: number | null;
  total_vat: number | null;
  total_ttc: number | null;
  currency: string | null;

  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_tax_id: string | null;

  created_by_user_id: string | null;

  signature_status: string | null;
  signed_at: string | null;

  ttn_status: string | null;
};

function fmt3(v: any) {
  const x = Number(v ?? 0);
  const n = Number.isFinite(x) ? x : 0;
  return (Math.round(n * 1000) / 1000).toFixed(3);
}

function docTypeLabel(r: InvoiceRow) {
  const t = (r.document_type || "facture").toLowerCase();
  if (t === "devis") return "Devis";
  if (t === "avoir") return "Avoir";
  return "Facture";
}

function modeLabel(r: InvoiceRow) {
  const m = (r.invoice_mode || "normale").toLowerCase();
  return m === "permanente" ? "Permanente" : "Normale";
}

function ttnLabel(r: InvoiceRow) {
  const s = (r.ttn_status || "not_sent").toLowerCase();
  if (s === "accepted") return "Acceptée";
  if (s === "submitted") return "Soumise";
  if (s === "scheduled") return "Planifiée";
  if (s === "rejected") return "Rejetée";
  if (s === "canceled") return "Annulée";
  return "Non envoyée";
}

function isSigned(r: InvoiceRow) {
  const st = (r.signature_status || "").toLowerCase();
  return st === "signed" || !!r.signed_at;
}

function sigLabel(r: InvoiceRow) {
  return isSigned(r) ? "Signée" : "Non signée";
}

function fmtDate(d?: string | null) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString();
  } catch {
    return String(d);
  }
}

export default function InvoicesClient({ companies }: { companies: Company[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [usersMap, setUsersMap] = useState<Map<string, AppUser>>(new Map());

  const [companyId, setCompanyId] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [mode, setMode] = useState<string>("all");
  const [sig, setSig] = useState<string>("all");
  const [ttn, setTtn] = useState<string>("all");
  const [createdBy, setCreatedBy] = useState<string>("all");

  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");

  const [clientQ, setClientQ] = useState("");
  const [q, setQ] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const { data: inv, error: invErr } = await supabase
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
            "subtotal_ht",
            "total_vat",
            "total_ttc",
            "currency",
            "customer_name",
            "customer_email",
            "customer_phone",
            "customer_tax_id",
            "created_by_user_id",
            "signature_status",
            "ttn_status",
          ].join(",")
        )
        .order("created_at", { ascending: false })
        .limit(1500);

      if (invErr) throw invErr;

      const invoices = (inv ?? []) as InvoiceRow[];

      // signed_at est stocké dans invoice_signatures (pas dans invoices)
      const invIds = Array.from(new Set(invoices.map((x) => x.id).filter(Boolean))) as string[];
      if (invIds.length) {
        const { data: sigs, error: sigErr } = await supabase
          .from("invoice_signatures")
          .select("invoice_id,signed_at")
          .in("invoice_id", invIds);
        if (sigErr) throw sigErr;

        const sigMap = new Map<string, string | null>();
        for (const s of (sigs ?? []) as any[]) sigMap.set(String(s.invoice_id), s.signed_at ?? null);
        for (const r of invoices) (r as any).signed_at = sigMap.get(r.id) ?? null;
      }

      setRows(invoices);

      const ids = Array.from(new Set(invoices.map((x) => x.created_by_user_id).filter(Boolean))) as string[];
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

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const cqq = clientQ.trim().toLowerCase();
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;

    return rows.filter((r) => {
      if (companyId !== "all" && r.company_id !== companyId) return false;

      if (type !== "all") {
        const t = (r.document_type || "facture").toLowerCase();
        if (t !== type) return false;
      }

      if (mode !== "all") {
        const m = (r.invoice_mode || "normale").toLowerCase();
        if (m !== mode) return false;
      }

      if (sig !== "all") {
        const s = isSigned(r);
        if (sig === "signed" && !s) return false;
        if (sig === "not_signed" && s) return false;
      }

      if (ttn !== "all") {
        const t = (r.ttn_status || "not_sent").toLowerCase();
        if (t !== ttn) return false;
      }

      if (createdBy !== "all") {
        if ((r.created_by_user_id || "") !== createdBy) return false;
      }

      if (from || to) {
        const d = r.issue_date ? new Date(r.issue_date) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        if (from && d < from) return false;
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
      }

      if (cqq) {
        const blob = `${r.customer_name ?? ""} ${r.customer_email ?? ""} ${r.customer_phone ?? ""} ${r.customer_tax_id ?? ""}`.toLowerCase();
        if (!blob.includes(cqq)) return false;
      }

      if (qq) {
        const company = companyName.get(r.company_id) || "";
        const blob = `${company} ${r.invoice_number ?? ""} ${r.unique_reference ?? ""} ${r.customer_name ?? ""}`.toLowerCase();
        if (!blob.includes(qq)) return false;
      }

      return true;
    });
  }, [rows, companyId, type, mode, sig, ttn, createdBy, fromDate, toDate, clientQ, q, companyName]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  function userLabel(userId?: string | null) {
    if (!userId) return "";
    const u = usersMap.get(userId);
    return u?.full_name || u?.email || userId;
  }

  return (
    <div className="ftn-page">
      <div className="ftn-page-header">
        <div>
          <h1 className="ftn-title">Factures</h1>
          <p className="ftn-subtitle">Toutes vos factures (facture / devis / avoir / permanente) + suivi TTN</p>
        </div>
      </div>

      <div className="ftn-card">
        <div className="ftn-card-header">
          <div>
            <div className="ftn-card-title">Documents</div>
            <div className="ftn-card-subtitle">Factures, devis, avoirs — suivi signature et TTN.</div>
          </div>
          <div className="ftn-row" style={{ gap: 10 }}>
            <Link className="ftn-btn ftn-btn-primary" href="/invoices/new">
              + Nouveau document
            </Link>
            <Link className="ftn-btn" href="/declarations">
              Déclarations
            </Link>
          </div>
        </div>

        <div className="ftn-card-content">
          <div className="ftn-filters">
            <select className="ftn-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="all">Toutes les sociétés</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select className="ftn-input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">Type : tout</option>
              <option value="facture">Facture</option>
              <option value="devis">Devis</option>
              <option value="avoir">Avoir</option>
            </select>

            <select className="ftn-input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="all">Mode : tout</option>
              <option value="normale">Normale</option>
              <option value="permanente">Permanente</option>
            </select>

            <select className="ftn-input" value={sig} onChange={(e) => setSig(e.target.value)}>
              <option value="all">Signature : tout</option>
              <option value="signed">Signée</option>
              <option value="not_signed">Non signée</option>
            </select>

            <select className="ftn-input" value={ttn} onChange={(e) => setTtn(e.target.value)}>
              <option value="all">TTN : tout</option>
              <option value="not_sent">Non envoyée</option>
              <option value="scheduled">Planifiée</option>
              <option value="submitted">Soumise</option>
              <option value="accepted">Acceptée</option>
              <option value="rejected">Rejetée</option>
              <option value="canceled">Annulée</option>
            </select>

            <select className="ftn-input" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
              <option value="all">Créé par : tout</option>
              {createdByOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>

            <input className="ftn-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <input className="ftn-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />

            <input
              className="ftn-input"
              placeholder="Client (nom/email/tel/MF)"
              value={clientQ}
              onChange={(e) => setClientQ(e.target.value)}
            />

            <div className="ftn-row" style={{ gap: 10 }}>
              <input
                className="ftn-input"
                placeholder="Recherche (société, numéro, référence..)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="ftn-btn ftn-btn-primary" onClick={() => load()} disabled={loading}>
                Actualiser
              </button>
            </div>
          </div>

          {err ? (
            <div className="ftn-alert ftn-alert-error" role="alert">
              {err}
            </div>
          ) : null}

          <div className="ftn-table-wrap">
            <table className="ftn-table">
              <thead>
                <tr>
                  <th>Société</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Mode</th>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Créé par</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 16 }}>
                      Chargement...
                    </td>
                  </tr>
                ) : paged.length ? (
                  paged.map((r) => {
                    const company = companyName.get(r.company_id) || r.company_id;
                    return (
                      <tr key={r.id}>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <Link className="ftn-link" href={`/invoices/${r.id}`}>
                              {company}
                            </Link>
                            <div className="ftn-muted" style={{ fontSize: 12 }}>
                              {r.invoice_number || r.unique_reference || ""}
                            </div>
                            <div className="ftn-row" style={{ gap: 8, flexWrap: "wrap" }}>
                              <span className="ftn-badge">{docTypeLabel(r)}</span>
                              <span className="ftn-badge">{modeLabel(r)}</span>
                              <span className="ftn-badge">{sigLabel(r)}</span>
                              <span className="ftn-badge">{ttnLabel(r)}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div>{r.customer_name || "-"}</div>
                            <div className="ftn-muted" style={{ fontSize: 12 }}>
                              {r.customer_email || r.customer_phone || r.customer_tax_id || ""}
                            </div>
                          </div>
                        </td>
                        <td>{docTypeLabel(r)}</td>
                        <td>{modeLabel(r)}</td>
                        <td>{fmtDate(r.issue_date)}</td>
                        <td>{fmt3(r.total_ttc)} {r.currency || "TND"}</td>
                        <td>{userLabel(r.created_by_user_id)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} style={{ padding: 16 }}>
                      Aucun résultat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="ftn-pagination">
            <div className="ftn-muted">
              Page {safePage} / {totalPages} • {filtered.length} document(s)
            </div>
            <div className="ftn-row" style={{ gap: 10 }}>
              <button className="ftn-btn" onClick={() => setPage(1)} disabled={safePage <= 1}>
                Début
              </button>
              <button className="ftn-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
                Précédent
              </button>
              <button
                className="ftn-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
              >
                Suivant
              </button>
              <button className="ftn-btn" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages}>
                Fin
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
