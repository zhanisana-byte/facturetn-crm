"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Company = {
  id: string;
  company_name?: string;
  name?: string;
};

type InvoiceRow = {
  id: string;
  company_id: string;
  document_type: string | null;
  invoice_mode: string | null;
  issue_date: string | null;
  created_at: string | null;
  currency: string | null;
  total_ttc: number | null;
  invoice_number: string | null;
  unique_reference: string | null;
  customer_name: string | null;
  customer_tax_id: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  created_by_user_id: string | null;
  signature_status: string | null;
  ttn_status: string | null;
};

type RowActionState = {
  selected: Set<string>;
  busyId: string | null;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function fmt3(v: any) {
  return (Math.round(n(v) * 1000) / 1000).toFixed(3);
}

function fmtDate(v: any) {
  const d = s(v);
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString("fr-FR");
}

function isSigned(r: InvoiceRow) {
  return s(r.signature_status).toLowerCase() === "signed";
}

function docTypeLabel(r: InvoiceRow) {
  const t = s(r.document_type || "facture").toLowerCase();
  if (t === "devis" || t === "quote") return "Devis";
  if (t === "avoir" || t === "credit_note") return "Avoir";
  return "Facture";
}

function modeLabel(r: InvoiceRow) {
  const m = s(r.invoice_mode || "normal").toLowerCase();
  return m === "permanente" ? "Permanente" : "Normale";
}

function ttnLabel(r: InvoiceRow) {
  const t = s(r.ttn_status || "not_sent").toLowerCase();
  if (t === "accepted") return "TTN: Acceptée";
  if (t === "rejected") return "TTN: Rejetée";
  if (t === "submitted") return "TTN: Soumise";
  if (t === "scheduled") return "TTN: Programmée";
  if (t === "canceled") return "TTN: Annulée";
  if (t === "failed") return "TTN: Erreur";
  return "TTN: Non envoyée";
}

export default function InvoicesClient({ companies }: { companies: Company[] }) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [usersMap, setUsersMap] = useState<Map<string, any>>(new Map());
  const [companyName, setCompanyName] = useState<Map<string, string>>(
    () => new Map(companies.map((c) => [c.id, c.company_name || c.name || c.id]))
  );

  const [companyId, setCompanyId] = useState("");
  const [type, setType] = useState("tout");
  const [mode, setMode] = useState("tout");
  const [sig, setSig] = useState("tout");
  const [ttn, setTtn] = useState("tout");
  const [createdBy, setCreatedBy] = useState("tout");
  const [addedFrom, setAddedFrom] = useState("");
  const [addedTo, setAddedTo] = useState("");
  const [clientQ, setClientQ] = useState("");
  const [q, setQ] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [sel, setSel] = useState<RowActionState>({ selected: new Set(), busyId: null });

  function toggleSelected(id: string, on?: boolean) {
    setSel((p) => {
      const next = new Set(p.selected);
      const v = typeof on === "boolean" ? on : !next.has(id);
      v ? next.add(id) : next.delete(id);
      return { ...p, selected: next };
    });
  }

  function toggleAll(on: boolean, list: InvoiceRow[]) {
    setSel((p) => {
      const next = new Set(p.selected);
      for (const r of list) {
        if (isSigned(r)) continue;
        on ? next.add(r.id) : next.delete(r.id);
      }
      return { ...p, selected: next };
    });
  }

  function extractList(payload: any): InvoiceRow[] {
    const a = payload?.invoices ?? payload?.data ?? payload?.rows ?? [];
    return Array.isArray(a) ? a : [];
  }

  function extractUsers(payload: any): any[] {
    const a = payload?.users ?? payload?.included?.users ?? payload?.meta?.users ?? [];
    return Array.isArray(a) ? a : [];
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/invoices/list?limit=500", { cache: "no-store" });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = String(data?.error || data?.message || `HTTP_${res.status}`);
        throw new Error(msg);
      }

      const invoices = extractList(data);
      const users = extractUsers(data);

      setRows(invoices);

      const um = new Map<string, any>();
      for (const u of users) um.set(String(u.id), u);
      setUsersMap(um);
    } catch (e: any) {
      setRows([]);
      setUsersMap(new Map());
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  async function deleteOne(id: string) {
    if (!id) return;
    setSel((p) => ({ ...p, busyId: id }));
    try {
      const res = await fetch(`/api/invoices/${id}/delete`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(String(data?.error || data?.message || `HTTP_${res.status}`));
      setSel((p) => {
        const next = new Set(p.selected);
        next.delete(id);
        return { ...p, selected: next };
      });
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setSel((p) => ({ ...p, busyId: null }));
    }
  }

  async function bulkDelete() {
    const ids = Array.from(sel.selected);
    if (!ids.length) return;

    setLoading(true);
    setErr(null);
    try {
      for (const id of ids) {
        const r = rows.find((x) => x.id === id);
        if (!r) continue;
        if (isSigned(r)) continue;

        const res = await fetch(`/api/invoices/${id}/delete`, { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(String(data?.error || data?.message || `HTTP_${res.status}`));
        }
      }
      setSel((p) => ({ ...p, selected: new Set() }));
      await load();
    } catch (e: any) {
      setErr(String(e?.message || "Erreur"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setCompanyName(new Map(companies.map((c) => [c.id, c.company_name || c.name || c.id])));
    load();
  }, [companies]);

  const filtered = useMemo(() => {
    const from = addedFrom ? new Date(addedFrom) : null;
    const to = addedTo ? new Date(addedTo) : null;
    const cqq = clientQ.trim().toLowerCase();
    const qq = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (companyId && r.company_id !== companyId) return false;

      const dt = s(r.document_type || "facture").toLowerCase();
      if (type !== "tout") {
        if (type === "facture" && !(dt === "facture" || dt === "invoice")) return false;
        if (type === "devis" && !(dt === "devis" || dt === "quote")) return false;
        if (type === "avoir" && !(dt === "avoir" || dt === "credit_note")) return false;
      }

      const md = s(r.invoice_mode || "normal").toLowerCase();
      if (mode !== "tout") {
        if (mode === "normal" && md !== "normal") return false;
        if (mode === "permanente" && md !== "permanente") return false;
      }

      const signed = isSigned(r);
      if (sig === "signed" && !signed) return false;
      if (sig === "not_signed" && signed) return false;

      const ts = s(r.ttn_status || "not_sent").toLowerCase();
      if (ttn !== "tout" && ts !== ttn) return false;

      if (createdBy !== "tout" && s(r.created_by_user_id) !== createdBy) return false;

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
        const c = companyName.get(r.company_id) || "";
        const blob = `${c} ${r.invoice_number ?? ""} ${r.unique_reference ?? ""} ${r.customer_name ?? ""}`.toLowerCase();
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

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage]);

  const allSelectableOnPage = pageRows.filter((r) => !isSigned(r));
  const allChecked = allSelectableOnPage.length > 0 && allSelectableOnPage.every((r) => sel.selected.has(r.id));

  return (
    <div className="ftn-card">
      <div className="ftn-card-content">
        {err ? (
          <div className="ftn-alert ftn-alert-error" role="alert" style={{ marginBottom: 12 }}>
            {err}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <select className="ftn-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Toutes les sociétés</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || c.name}
              </option>
            ))}
          </select>

          <select className="ftn-input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="tout">Type : tout</option>
            <option value="facture">Facture</option>
            <option value="devis">Devis</option>
            <option value="avoir">Avoir</option>
          </select>

          <select className="ftn-input" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="tout">Mode : tout</option>
            <option value="normal">Normale</option>
            <option value="permanente">Permanente</option>
          </select>

          <select className="ftn-input" value={sig} onChange={(e) => setSig(e.target.value)}>
            <option value="tout">Signature : tout</option>
            <option value="signed">Signée</option>
            <option value="not_signed">Non signée</option>
          </select>

          <select className="ftn-input" value={ttn} onChange={(e) => setTtn(e.target.value)}>
            <option value="tout">TTN : tout</option>
            <option value="not_sent">Non envoyée</option>
            <option value="scheduled">Programmée</option>
            <option value="submitted">Soumise</option>
            <option value="accepted">Acceptée</option>
            <option value="rejected">Rejetée</option>
            <option value="canceled">Annulée</option>
            <option value="failed">Erreur</option>
          </select>

          <select className="ftn-input" value={createdBy} onChange={(e) => setCreatedBy(e.target.value)}>
            <option value="tout">Créé par : tout</option>
            {Array.from(usersMap.entries()).map(([id, u]) => (
              <option key={id} value={id}>
                {u?.full_name || u?.email || id}
              </option>
            ))}
          </select>

          <input className="ftn-input" type="date" value={addedFrom} onChange={(e) => setAddedFrom(e.target.value)} />
          <input className="ftn-input" type="date" value={addedTo} onChange={(e) => setAddedTo(e.target.value)} />

          <input className="ftn-input" placeholder="Client (nom/email/tel/MF)" value={clientQ} onChange={(e) => setClientQ(e.target.value)} />
          <input className="ftn-input" placeholder="Recherche (société, numéro, référence..)" value={q} onChange={(e) => setQ(e.target.value)} />

          <button className="ftn-btn" type="button" onClick={() => load()} disabled={loading}>
            Actualiser
          </button>

          <button className="ftn-btn" type="button" onClick={() => bulkDelete()} disabled={!sel.selected.size || loading}>
            Supprimer sélection
          </button>
        </div>

        <div className="ftn-table-wrap">
          <table className="ftn-table">
            <thead>
              <tr>
                <th style={{ width: 44 }}>
                  <input type="checkbox" checked={allChecked} disabled={!allSelectableOnPage.length} onChange={(e) => toggleAll(e.target.checked, pageRows)} />
                </th>
                <th>Société</th>
                <th>Client</th>
                <th>Type</th>
                <th>Mode</th>
                <th>Date</th>
                <th>Montant</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 16 }}>
                    Chargement...
                  </td>
                </tr>
              ) : pageRows.length ? (
                pageRows.map((r) => {
                  const signed = isSigned(r);
                  const company = companyName.get(r.company_id) || r.company_id;
                  return (
                    <tr key={r.id}>
                      <td>
                        <input type="checkbox" disabled={signed} checked={sel.selected.has(r.id)} onChange={(e) => toggleSelected(r.id, e.target.checked)} />
                      </td>
                      <td>
                        <Link className="ftn-link" href={`/invoices/${r.id}`}>
                          {company}
                        </Link>
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                          {r.invoice_number || r.unique_reference || ""}
                          {r.invoice_number || r.unique_reference ? " · " : ""}
                          {signed ? "Signée" : "Non signée"}
                          {" · "}
                          {ttnLabel(r)}
                        </div>
                      </td>
                      <td>{r.customer_name || "—"}</td>
                      <td>{docTypeLabel(r)}</td>
                      <td>{modeLabel(r)}</td>
                      <td>{fmtDate(r.issue_date)}</td>
                      <td>
                        {fmt3(r.total_ttc)} {r.currency || "TND"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${r.id}`}>
                            Voir
                          </Link>

                          {!signed ? (
                            <>
                              <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${r.id}/edit`}>
                                Modifier
                              </Link>
                              <button className="ftn-btn ftn-btn-ghost" type="button" disabled={sel.busyId === r.id} onClick={() => deleteOne(r.id)}>
                                Supprimer
                              </button>
                              <Link className="ftn-btn" href={`/invoices/${r.id}/signature?back=${encodeURIComponent("/invoices")}`}>
                                Signer
                              </Link>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: 16 }}>
                    Aucun résultat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ opacity: 0.75 }}>
            Page {safePage} / {totalPages} • {filtered.length} document(s)
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="ftn-btn" onClick={() => setPage(1)} disabled={safePage <= 1}>
              Début
            </button>
            <button className="ftn-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>
              Précédent
            </button>
            <button className="ftn-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>
              Suivant
            </button>
            <button className="ftn-btn" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages}>
              Fin
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
