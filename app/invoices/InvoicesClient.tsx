"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Company = {
  id: string;
  company_name: string;
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
  const x = n(v);
  return (Math.round(x * 1000) / 1000).toFixed(3);
}

function fmtDate(d: any) {
  const v = s(d);
  if (!v) return "—";
  try {
    const dt = new Date(v);
    if (Number.isNaN(dt.getTime())) return v;
    return dt.toLocaleDateString("fr-FR");
  } catch {
    return v;
  }
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

function isSigned(r: InvoiceRow) {
  const st = s(r.signature_status).toLowerCase();
  return st === "signed";
}

function sigTone(r: InvoiceRow) {
  return isSigned(r) ? "sig-green" : "sig-red";
}

export default function InvoicesClient({ companies }: { companies: Company[] }) {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [usersMap, setUsersMap] = useState<Map<string, any>>(new Map());
  const [companyName, setCompanyName] = useState<Map<string, string>>(
    () => new Map(companies.map((c) => [c.id, c.company_name]))
  );

  const [companyId, setCompanyId] = useState<string>("");
  const [type, setType] = useState<string>("tout");
  const [mode, setMode] = useState<string>("tout");
  const [sig, setSig] = useState<string>("tout");
  const [ttn, setTtn] = useState<string>("tout");
  const [createdBy, setCreatedBy] = useState<string>("tout");
  const [addedFrom, setAddedFrom] = useState<string>("");
  const [addedTo, setAddedTo] = useState<string>("");
  const [clientQ, setClientQ] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [sel, setSel] = useState<RowActionState>({ selected: new Set(), busyId: null });

  function toggleSelected(id: string, on?: boolean) {
    setSel((p) => {
      const next = new Set(p.selected);
      const should = typeof on === "boolean" ? on : !next.has(id);
      if (should) next.add(id);
      else next.delete(id);
      return { ...p, selected: next };
    });
  }

  function toggleAll(on: boolean, list: InvoiceRow[]) {
    setSel((p) => {
      const next = new Set(p.selected);
      for (const r of list) {
        if (isSigned(r)) continue;
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return { ...p, selected: next };
    });
  }

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/invoices/list?limit=500", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(String(data?.error || data?.message || `HTTP_${res.status}`));

      const invoices = (data?.invoices || data?.data || []) as InvoiceRow[];
      const users = (data?.users || []) as any[];

      const um = new Map<string, any>();
      for (const u of users) um.set(String(u.id), u);
      setUsersMap(um);

      setRows(invoices);
    } catch (e: any) {
      setErr(String(e?.message || "Erreur."));
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
      setErr(String(e?.message || "Erreur."));
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
      setErr(String(e?.message || "Erreur."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    setCompanyName(new Map(companies.map((c) => [c.id, c.company_name])));
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
      if (sig !== "tout") {
        if (sig === "signed" && !signed) return false;
        if (sig === "
