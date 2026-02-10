"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string };
type AppUser = { id: string; full_name: string | null; email: string | null };

type InvoiceRow = {
  id: string;
  company_id: string;

  created_at: string | null;
  issue_date: string | null;

  invoice_number: string | null;
  unique_reference: string | null;

  document_type: string | null;
  invoice_mode: string | null;

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

  const [addedFrom, setAddedFrom] = useState<string>("");
  const [addedTo, setAddedTo] = useState<string>("");

  const [clientQ, setClientQ] = useState("");
  const [q, setQ] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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
            "created_at",
            "issue_date",
            "invoice_number",
            "unique_reference",
            "document_type",
            "invoice_mode",
            "total_ttc",
            "currency",
            "customer_name",
            "customer_email",
            "customer_phone",
            "customer_tax_id",
            "created_by_user_id",
            "signature_status",
            "ttn_status",
          ].join(","),
        )
        .order("created_at", { ascending: false })
        .limit(1500);

      if (invErr) throw invErr;

      const invoices = (inv ?? []) as InvoiceRow[];

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
      setSelected(new Set());

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

    const from = addedFrom ? new Date(addedFrom) : null;
    const to = addedTo ? new Date(addedTo) : null;

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
        const d = r.created_at ? new Date(r.created_at) : null;
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
  }, [rows, companyId, type, mode, sig, ttn, createdBy, addedFrom, addedTo, clientQ, q, companyName]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const pageUnsignedIds = useMemo(() => paged.filter((r) => !isSigned(r)).map((r) => r.id), [paged]);

  const allUnsignedSelectedOnPage = useMemo(() => {
    if (!pageUnsignedIds.length) return false;
    for (const id of pageUnsignedIds) if (!selected.has(id)) return false;
    return true;
  }, [pageUnsignedIds, selected]);

  function toggleSelectOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllOnPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) for (const id of pageUnsignedIds) next.add(id);
      else for (const id of pageUnsignedIds) next.delete(id);
      return next;
    });
  }

  function userLabel(userId?: string | null) {
    if (!userId) return "";
    const u = usersMap.get(userId);
    return u?.full_name || u?.email || userId;
  }

  async function deleteViaRoute(id: string) {
    const res = await fetch(`/invoices/${id}/delete`, { method: "POST" });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.ok) {
      throw new Error(j?.error || "Suppression impossible.");
    }
  }

  async function deleteInvoices(ids: string[]) {
    if (!ids.length) return;
    setDeleting(true);
    setErr(null);
    try {
      for (const id of ids) {
        await deleteViaRoute(id);
      }
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteOne(id: string) {
    const ok = window.confirm("Supprimer ce document ? Cette action est irréversible.");
    if (!ok) return;
    await deleteInvoices([id]);
  }

  async function deleteSelected() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const ok = window.confirm(` linking to the display name if applicable. You don't have to separately include the email address if a linked display name is present. You should ellipsis out the snippet if it is being cutoff. If the email response payload has a display_url, "Open in Gmail" *MUST* be linked to the email display_url underneath the subject of each displayed email. If you include the display_url in your response, it should always be markdown formatted to link on some piece of text. The tool response has HTML escaping, you **MUST** preserve that HTML escaping verbatim when rendering the email. Message ids are only intended for internal use and should not be exposed to users. Unless there is significant ambiguity in the user's request, you should usually try to perform the task without follow ups. Be curious with searches and reads, feel free to make reasonable and *grounded* assumptions, and call the functions when they may be useful to the user. If a function does not return a response, the user has declined to accept that action or an error has occurred. You should acknowledge if an error has occurred. When you are setting up an automation which will later need access to the user's email, you must do a dummy search tool call with an empty query first to make sure this tool is set up properly.`);
    if (!ok) return;
    await deleteInvoices(ids);
  }

  return (
    <div className="ftn-page">
      <div className="ftn-card">
        <div className="ftn-card-header">
          <div className="ftn-row" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link className="ftn-btn ftn-btn-primary" href="/invoices/new">
              + Nouveau document
            </Link>
            <button className="ftn-btn ftn-btn-danger" onClick={deleteSelected} disabled={deleting || !selected.size}>
              Supprimer sélection ({selected.size})
            </button>
            <button className="ftn-btn" onClick={() => load()} disabled={loading || deleting}>
              Actualiser
            </button>
          </div>
        </div>

        <div className="ftn-card-content">
          <div className="inv-grid">
            <select className="ftn-input inv-span-2" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
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

            <select className="ftn-input inv-span-2" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
              <option value="all">Créé par : tout</option>
              {createdByOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>

            <input className="ftn-input" type="date" value={addedFrom} onChange={(e) => setAddedFrom(e.target.value)} aria-label="Ajout du" />
            <input className="ftn-input" type="date" value={addedTo} onChange={(e) => setAddedTo(e.target.value)} aria-label="Ajout au" />
          </div>

          <div className="inv-search-row">
            <input className="ftn-input" placeholder="Client (nom/email/tel/MF)" value={clientQ} onChange={(e) => setClientQ(e.target.value)} />
            <input className="ftn-input" placeholder="Recherche (société, numéro, référence..)" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="ftn-btn ftn-btn-primary" onClick={() => load()} disabled={loading || deleting}>
              Rechercher
            </button>
          </div>

          <div className="inv-date-hints">
            <span>Ajout du</span>
            <span>Au</span>
          </div>

          {err ? (
            <div className="ftn-alert ftn-alert-error" role="alert" style={{ marginTop: 12 }}>
              {err}
            </div>
          ) : null}

          <div className="ftn-table-wrap" style={{ marginTop: 12 }}>
            <table className="ftn-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>
                    <input
                      type="checkbox"
                      checked={allUnsignedSelectedOnPage}
                      onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                      disabled={!pageUnsignedIds.length || loading || deleting}
                      aria-label="Sélectionner tout (non signés)"
                    />
                  </th>
                  <th>Société</th>
                  <th>Client</th>
                  <th>Type</th>
                  <th>Mode</th>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Créé par</th>
                  <th style={{ width: 260 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 16 }}>
                      Chargement...
                    </td>
                  </tr>
                ) : paged.length ? (
                  paged.map((r) => {
                    const company = companyName.get(r.company_id) || r.company_id;
                    const signed = isSigned(r);
                    return (
                      <tr key={r.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={(e) => toggleSelectOne(r.id, e.target.checked)}
                            disabled={signed || deleting}
                            aria-label={signed ? "Document signé (sélection désactivée)" : "Sélectionner"}
                          />
                        </td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <Link className="ftn-link" href={`/invoices/${r.id}`}>
                              {company}
                            </Link>
