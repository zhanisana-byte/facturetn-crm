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
  const t = s(r.document_type).toLowerCase();
  if (t === "devis" || t === "quote") return "Devis";
  if (t === "avoir" || t === "credit_note") return "Avoir";
  return "Facture";
}

function modeLabel(r: InvoiceRow) {
  return s(r.invoice_mode).toLowerCase() === "permanente" ? "Permanente" : "Normale";
}

function ttnLabel(r: InvoiceRow) {
  const t = s(r.ttn_status).toLowerCase();
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
    () => new Map(companies.map((c) => [c.id, c.company_name || c.name || ""]))
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

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/invoices/list?limit=500", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "ERROR");
      setRows(data.invoices || []);
      const um = new Map<string, any>();
      (data.users || []).forEach((u: any) => um.set(u.id, u));
      setUsersMap(um);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteOne(id: string) {
    setSel((p) => ({ ...p, busyId: id }));
    await fetch(`/api/invoices/${id}/delete`, { method: "POST" });
    setSel((p) => ({ ...p, busyId: null, selected: new Set() }));
    load();
  }

  async function bulkDelete() {
    for (const id of sel.selected) {
      const r = rows.find((x) => x.id === id);
      if (r && !isSigned(r)) {
        await fetch(`/api/invoices/${id}/delete`, { method: "POST" });
      }
    }
    setSel({ selected: new Set(), busyId: null });
    load();
  }

  useEffect(() => {
    load();
    setCompanyName(new Map(companies.map((c) => [c.id, c.company_name || c.name || ""])));
  }, [companies]);

  const filtered = useMemo(() => {
    const from = addedFrom ? new Date(addedFrom) : null;
    const to = addedTo ? new Date(addedTo) : null;
    const cqq = clientQ.toLowerCase();
    const qq = q.toLowerCase();

    return rows.filter((r) => {
      if (companyId && r.company_id !== companyId) return false;

      const dt = s(r.document_type).toLowerCase();
      if (type !== "tout") {
        if (type === "facture" && !["facture", "invoice"].includes(dt)) return false;
        if (type === "devis" && !["devis", "quote"].includes(dt)) return false;
        if (type === "avoir" && !["avoir", "credit_note"].includes(dt)) return false;
      }

      const md = s(r.invoice_mode).toLowerCase();
      if (mode !== "tout" && md !== mode) return false;

      const signed = isSigned(r);
      if (sig === "signed" && !signed) return false;
      if (sig === "not_signed" && signed) return false;

      if (ttn !== "tout" && s(r.ttn_status) !== ttn) return false;
      if (createdBy !== "tout" && s(r.created_by_user_id) !== createdBy) return false;

      if (from || to) {
        const d = r.created_at ? new Date(r.created_at) : null;
        if (!d) return false;
        if (from && d < from) return false;
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
      }

      if (cqq) {
        const blob = `${r.customer_name} ${r.customer_email} ${r.customer_phone} ${r.customer_tax_id}`.toLowerCase();
        if (!blob.includes(cqq)) return false;
      }

      if (qq) {
        const blob = `${companyName.get(r.company_id)} ${r.invoice_number} ${r.unique_reference}`.toLowerCase();
        if (!blob.includes(qq)) return false;
      }

      return true;
    });
  }, [rows, companyId, type, mode, sig, ttn, createdBy, addedFrom, addedTo, clientQ, q, companyName]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="ftn-card">
      <div className="ftn-card-content">
        <div className="ftn-table-wrap">
          <table className="ftn-table">
            <thead>
              <tr>
                <th />
                <th>Société</th>
                <th>Client</th>
                <th>Type</th>
                <th>Mode</th>
                <th>Date</th>
                <th>Montant</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const signed = isSigned(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <input
                        type="checkbox"
                        disabled={signed}
                        checked={sel.selected.has(r.id)}
                        onChange={(e) => toggleSelected(r.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      <Link href={`/invoices/${r.id}`}>{companyName.get(r.company_id)}</Link>
                      <div style={{ fontSize: 12 }}>
                        {r.invoice_number || r.unique_reference}
                        {" · "}
                        {signed ? "Signée" : "Non signée"}
                        {" · "}
                        {ttnLabel(r)}
                      </div>
                    </td>
                    <td>{r.customer_name}</td>
                    <td>{docTypeLabel(r)}</td>
                    <td>{modeLabel(r)}</td>
                    <td>{fmtDate(r.issue_date)}</td>
                    <td>
                      {fmt3(r.total_ttc)} {r.currency || "TND"}
                    </td>
                    <td>
                      <Link href={`/invoices/${r.id}`}>Voir</Link>
                      {!signed && (
                        <>
                          {" · "}
                          <Link href={`/invoices/${r.id}/edit`}>Modifier</Link>
                          {" · "}
                          <button onClick={() => deleteOne(r.id)}>Supprimer</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
