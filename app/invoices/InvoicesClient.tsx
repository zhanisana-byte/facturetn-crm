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

function isSigned(r: InvoiceRow) {
  const st = (r.signature_status || "").toLowerCase();
  return st === "signed" || !!r.signed_at;
}

function sigPill(r: InvoiceRow) {
  const st = (r.signature_status || "").toLowerCase();
  if (isSigned(r)) return { label: "Signée", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (st === "pending" || st === "in_progress" || st === "processing" || st === "pending_signature")
    return { label: "En cours", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  if (st === "error" || st === "failed") return { label: "Erreur", cls: "border-rose-200 bg-rose-50 text-rose-700" };
  return { label: "Non signée", cls: "border-slate-200 bg-slate-50 text-slate-700" };
}

function ttnPill(ttnStatus: string | null) {
  const s = (ttnStatus || "not_sent").toLowerCase();
  if (s === "accepted") return { label: "Accepté", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  if (s === "rejected") return { label: "Rejeté", cls: "border-rose-200 bg-rose-50 text-rose-700" };
  if (s === "submitted") return { label: "Soumis", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  if (s === "scheduled") return { label: "Programmé", cls: "border-amber-200 bg-amber-50 text-amber-800" };
  return { label: "Non envoyé", cls: "border-slate-200 bg-slate-50 text-slate-700" };
}

function xmlReady(r: InvoiceRow) {
  const hasDate = !!(r.issue_date && r.issue_date.slice(0, 10));
  const hasClient = !!(r.customer_name && r.customer_name.trim().length >= 2);
  const hasTaxOrEmail = !!((r.customer_tax_id && r.customer_tax_id.trim()) || (r.customer_email && r.customer_email.trim()));
  const hasTotals = Number(r.total_ttc ?? 0) > 0;
  return hasDate && hasClient && hasTaxOrEmail && hasTotals;
}

export default function InvoicesClient({ companies }: { companies: Company[] }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [usersMap, setUsersMap] = useState<Map<string, AppUser>>(new Map());

  const [companyId, setCompanyId] = useState("all");
  const [docType, setDocType] = useState("all");
  const [mode, setMode] = useState("all");
  const [sig, setSig] = useState("all");
  const [ttn, setTtn] = useState("all");
  const [createdBy, setCreatedBy] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [clientTerm, setClientTerm] = useState("");
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
            "signed_at",
            "ttn_status",
          ].join(",")
        )
        .order("created_at", { ascending: false })
        .limit(1500);

      if (invErr) throw invErr;

      const invoices = (inv ?? []) as InvoiceRow[];
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

  function displayUser(uid: string | null) {
    if (!uid) return "—";
    const u = usersMap.get(uid);
    return u?.full_name || u?.email || "—";
  }

  const filtered = useMemo(() => {
    const tSearch = q.trim().toLowerCase();
    const tClient = clientTerm.trim().toLowerCase();

    const df = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const dt = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

    return rows.filter((r) => {
      if (companyId !== "all" && r.company_id !== companyId) return false;

      const dtp = (r.document_type || "facture").toLowerCase();
      if (docType !== "all" && dtp !== docType) return false;

      const md = (r.invoice_mode || "normale").toLowerCase();
      if (mode !== "all") {
        if (mode === "permanente" && md !== "permanente") return false;
        if (mode === "normale" && md === "permanente") return false;
      }

      const signed = isSigned(r);
      if (sig === "signed" && !signed) return false;
      if (sig === "not_signed" && signed) return false;

      const ttnStatus = (r.ttn_status || "not_sent").toLowerCase();
      if (ttn !== "all" && ttnStatus !== ttn) return false;

      if (createdBy !== "all" && (r.created_by_user_id || "") !== createdBy) return false;

      if (df || dt) {
        const d = r.issue_date ? new Date(`${r.issue_date.slice(0, 10)}T12:00:00`) : null;
        if (!d) return false;
        if (df && d < df) return false;
        if (dt && d > dt) return false;
      }

      if (tClient) {
        const cn = (r.customer_name || "").toLowerCase();
        const ce = (r.customer_email || "").toLowerCase();
        const cp = (r.customer_phone || "").toLowerCase();
        const ct = (r.customer_tax_id || "").toLowerCase();
        if (!(cn.includes(tClient) || ce.includes(tClient) || cp.includes(tClient) || ct.includes(tClient))) return false;
      }

      if (!tSearch) return true;

      const comp = (companyName.get(r.company_id) || "").toLowerCase();
      const ref = (r.unique_reference || "").toLowerCase();
      const no = (r.invoice_number || "").toLowerCase();
      const cl = (r.customer_name || "").toLowerCase();
      const typ = `${docTypeLabel(r)} ${modeLabel(r)}`.toLowerCase();

      return comp.includes(tSearch) || ref.includes(tSearch) || no.includes(tSearch) || cl.includes(tSearch) || typ.includes(tSearch);
    });
  }, [rows, companyId, docType, mode, sig, ttn, createdBy, dateFrom, dateTo, clientTerm, q, companyName]);

  useEffect(() => setPage(1), [companyId, docType, mode, sig, ttn, createdBy, dateFrom, dateTo, clientTerm, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="ftn-card p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Documents</div>
            <div className="text-sm text-slate-600">Factures, devis, avoirs — suivi signature et TTN.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/invoices/new" className="ftn-btn">
              + Nouveau document
            </Link>
            <Link href="/declarations" className="ftn-btn ftn-btn-ghost">
              Déclarations
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-2">
          <select className="ftn-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
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

          <select className="ftn-input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="all">Mode : tout</option>
            <option value="normale">Normale</option>
            <option value="permanente">Permanente</option>
          </select>

          <select className="ftn-input" value={sig} onChange={(e) => setSig(e.target.value)}>
            <option value="all">Signature : tout</option>
            <option value="not_signed">Non signée</option>
            <option value="signed">Signée</option>
          </select>
        </div>

        <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
          <select className="ftn-input" value={ttn} onChange={(e) => setTtn(e.target.value)}>
            <option value="all">TTN : tout</option>
            <option value="not_sent">Non envoyé</option>
            <option value="scheduled">Programmé</option>
            <option value="submitted">Soumis</option>
            <option value="accepted">Accepté</option>
            <option value="rejected">Rejeté</option>
          </select>

          <select className="ftn-input" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
            <option value="all">Créé par : tout</option>
            {createdByOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>

          <input className="ftn-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input className="ftn-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>

        <div className="mt-2 flex flex-col md:flex-row gap-2">
          <input className="ftn-input flex-1" placeholder="Client (nom/email/tel/MF)" value={clientTerm} onChange={(e) => setClientTerm(e.target.value)} />
          <input className="ftn-input flex-1" placeholder="Recherche (société, numéro, référence…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="ftn-btn" onClick={() => load()} disabled={loading}>
            Actualiser
          </button>
        </div>

        {err ? <div className="mt-3 ftn-alert">{err}</div> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="ftn-table min-w-[1250px]">
            <thead>
              <tr>
                <th>Société</th>
                <th>Client</th>
                <th>Type</th>
                <th>Mode</th>
                <th>Date</th>
                <th>Montant</th>
                <th>Créé par</th>
                <th>Signature</th>
                <th>TTN</th>
                <th>Résumé</th>
                <th className="text-right">Télécharger</th>
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
                  const sigx = sigPill(r);
                  const ttnx = ttnPill(r.ttn_status);
                  const okXml = xmlReady(r);

                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">
                        <div className="font-medium">{companyName.get(r.company_id) ?? "—"}</div>
                        <div className="text-xs text-slate-500">{r.invoice_number || r.unique_reference || "—"}</div>
                      </td>

                      <td className="whitespace-nowrap">
                        <div className="font-medium">{r.customer_name || "—"}</div>
                        <div className="text-xs text-slate-500">{r.customer_email || r.customer_phone || r.customer_tax_id || "—"}</div>
                      </td>

                      <td className="whitespace-nowrap">{docTypeLabel(r)}</td>
                      <td className="whitespace-nowrap">{modeLabel(r)}</td>
                      <td className="whitespace-nowrap">{(r.issue_date || "").slice(0, 10) || "—"}</td>

                      <td className="whitespace-nowrap">
                        <div className="font-medium">
                          {fmt3(r.total_ttc)} {r.currency || "TND"}
                        </div>
                        <div className="text-xs text-slate-500">
                          HT {fmt3(r.subtotal_ht)} • TVA {fmt3(r.total_vat)}
                        </div>
                      </td>

                      <td className="whitespace-nowrap">{displayUser(r.created_by_user_id)}</td>

                      <td className="whitespace-nowrap">
                        <span className={`ftn-pill ${sigx.cls}`}>{sigx.label}</span>
                      </td>

                      <td className="whitespace-nowrap">
                        <span className={`ftn-pill ${ttnx.cls}`}>{ttnx.label}</span>
                      </td>

                      <td className="whitespace-nowrap">
                        <Link className="ftn-btn" href={`/invoices/${r.id}/summary`} prefetch={false}>
                          Déclarer
                        </Link>
                        <div className="text-xs text-slate-500 mt-1">{okXml ? "XML prêt" : "Données incomplètes"}</div>
                      </td>

                      <td className="whitespace-nowrap text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <a className="ftn-btn ftn-btn-ghost" href={`/api/invoices/${r.id}/pdf`} target="_blank" rel="noreferrer">
                            PDF
                          </a>
                          {okXml ? (
                            <a className="ftn-btn ftn-btn-ghost" href={`/api/invoices/${r.id}/xml`} target="_blank" rel="noreferrer">
                              XML
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-600">
            Page {pageSafe} / {totalPages} • {filtered.length} document(s)
          </div>
          <div className="flex gap-2">
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
    </div>
  );
}
