"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; name: string };

type InvoiceRow = {
  id: string;
  company_id: string;

  invoice_number: string | null;
  unique_reference: string | null;

  document_type: string | null; 
  invoice_mode: string | null; 
  issue_date: string | null;

  subtotal_ht: number | null; 
  total_vat: number | null; 
  total_ttc: number | null;
  currency: string | null;

  created_by_user_id: string | null;

  declaration_status: string | null; 
  declared_at: string | null;
  declaration_ref: string | null;

  ttn_status: string | null; 
  ttn_reference: string | null;
  ttn_scheduled_at: string | null;
  ttn_submitted_at: string | null;
  ttn_validated_at: string | null;
};

type Filters = {
  companyId: string;
  status: "all" | "accepted" | "rejected" | "submitted" | "scheduled" | "not_sent";
  month: string; 
  decl: "all" | "manual" | "auto" | "none";
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

function ttnPill(s: string | null) {
  const x = (s || "").toLowerCase();
  if (x === "accepted") return pill("Accepté / Validé", "ok");
  if (x === "rejected") return pill("Rejeté", "bad");
  if (x === "submitted") return pill("Envoyé", "warn");
  if (x === "scheduled") return pill("Programmé", "warn");
  if (x === "canceled") return pill("Annulé", "neutral");
  return pill("Non envoyé", "neutral");
}

function declPill(s: string | null) {
  const x = (s || "none").toLowerCase();
  if (x === "manual") return pill("Déclaration manuelle", "neutral");
  if (x === "auto") return pill("Déclaration auto", "warn");
  return pill("Non déclaré", "neutral");
}

function docLabel(doc: string | null, mode: string | null) {
  const dt = (doc || "").toLowerCase();
  const mm = (mode || "").toLowerCase();

  let base = "Facture";
  if (dt.includes("devis")) base = "Devis";
  if (dt.includes("avoir")) base = "Avoir";
  if (mm.includes("perman")) return `${base} (permanente)`;
  return base;
}

function ym(d: string | null) {
  if (!d) return "";
  return d.slice(0, 7);
}

export default function DeclarationsClient({ companies }: { companies: Company[] }) {
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const companyName = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<InvoiceRow[]>([]);

  const [filters, setFilters] = useState<Filters>({
    companyId: "all",
    status: "all",
    month: "all",
    decl: "all",
  });

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [q, setQ] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualInvoiceId, setManualInvoiceId] = useState<string | null>(null);
  const [manualType, setManualType] = useState("TVA");
  const [manualPeriod, setManualPeriod] = useState("all");
  const [manualRef, setManualRef] = useState("");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));

  function openManual(r: InvoiceRow) {
    setErr(null);
    setManualInvoiceId(r.id);
    setManualType("TVA");
    const defaultPeriod =
      filters.month !== "all" ? filters.month : ym((r.issue_date || "").slice(0, 10)) || ym(new Date().toISOString());
    setManualPeriod(defaultPeriod || "all");
    setManualRef(r.declaration_ref || "");
    setManualDate(new Date().toISOString().slice(0, 10));
    setManualOpen(true);
  }

  async function submitManual() {
    if (!manualInvoiceId) return;
    const type = String(manualType || "").trim();
    const period = String(manualPeriod || "").trim();
    if (!type) {
      setErr("Veuillez choisir un type de déclaration.");
      return;
    }
    if (!period || period === "all" || !/^\d{4}-\d{2}$/.test(period)) {
      setErr("Veuillez saisir une période au format YYYY-MM.");
      return;
    }
    const note = `type=${type};periode=${period}`;
    const declaredAt = manualDate ? new Date(`${manualDate}T00:00:00`).toISOString() : null;
    await setDeclaration(manualInvoiceId, "manual", manualRef.trim() || null, note, declaredAt);
    setManualOpen(false);
    setManualInvoiceId(null);
  }

  async function load() {
    setErr(null);
    setLoading(true);

    if (!supabase) {
      setErr("Configuration de l’application manquante. Merci de contacter l’administrateur.");
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
        [
          "id",
          "company_id",
          "invoice_number",
          "unique_reference",
          "document_type",
          "invoice_mode",
          "issue_date",
          "subtotal_ht",
          "total_vat",
          "total_ttc",
          "currency",
          "created_by_user_id",
          "declaration_status",
          "declared_at",
          "declaration_ref",
          "ttn_status",
          "ttn_reference",
          "ttn_scheduled_at",
          "ttn_submitted_at",
          "ttn_validated_at",
        ].join(",")
      )
      .in("company_id", ids)
      .order("issue_date", { ascending: false })
      .limit(900);

    if (error) {
      setErr(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(((data as any) ?? []) as InvoiceRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    
  }, [companies.map((c) => c.id).join(",")]);

  const months = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const key = ym((r.ttn_validated_at || r.declared_at || r.issue_date || "").slice(0, 10));
      if (key) set.add(key);
    });
    return Array.from(set).sort().reverse();
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.companyId !== "all" && r.company_id !== filters.companyId) return false;

      const st = (r.ttn_status || "not_sent").toLowerCase() as any;
      if (filters.status !== "all" && st !== filters.status) return false;

      const decl = (r.declaration_status || "none").toLowerCase() as any;
      if (filters.decl !== "all" && decl !== filters.decl) return false;

      const monthKey = ym((r.ttn_validated_at || r.declared_at || r.issue_date || "").slice(0, 10));
      if (filters.month !== "all" && monthKey !== filters.month) return false;

      if (!term) return true;

      const inSoc = (companyName.get(r.company_id) || "").toLowerCase();
      const inRef = (r.unique_reference || "").toLowerCase();
      const inNo = (r.invoice_number || "").toLowerCase();
      const inType = (r.document_type || "").toLowerCase();

      return inSoc.includes(term) || inRef.includes(term) || inNo.includes(term) || inType.includes(term);
    });
  }, [rows, filters, q, companyName]);

  useEffect(() => {
    setPage(1);
  }, [filters.companyId, filters.status, filters.month, filters.decl, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const paged = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSafe]);

const agg = useMemo(() => {
    let ca = 0;
    let tva = 0;
    const byCompany = new Map<string, { ca: number; tva: number }>();

    filtered.forEach((r) => {
      const caRow = Number(r.subtotal_ht ?? 0);
      const tvaRow = Number(r.total_vat ?? 0);

      ca += caRow;
      tva += tvaRow;

      const x = byCompany.get(r.company_id) ?? { ca: 0, tva: 0 };
      x.ca += caRow;
      x.tva += tvaRow;
      byCompany.set(r.company_id, x);
    });

    return { ca, tva, byCompany };
  }, [filtered]);

  async function setDeclaration(
    invoiceId: string,
    status: "none" | "manual" | "auto",
    ref: string | null,
    note: string | null,
    declaredAtIso?: string | null
  ) {
    setErr(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/declaration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ref, note, declaredAt: declaredAtIso ?? null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || "Erreur déclaration.");
      }
      await load();
    } catch (e: any) {
      setErr(e?.message || "Erreur déclaration.");
    }
  }

async function cancelSchedule(invoiceId: string) {
    if (!supabase) return;
    if (!confirm("Annuler la programmation de cette facture ?")) return;

    setErr(null);
    try {
      await supabase
        .from("ttn_invoice_queue")
        .update({ status: "canceled", canceled_at: new Date().toISOString() })
        .eq("invoice_id", invoiceId);

      await supabase
        .from("invoices")
        .update({ ttn_status: "not_sent", ttn_scheduled_at: null })
        .eq("id", invoiceId);

      await load();
    } catch (e: any) {
      setErr(e?.message || "Erreur annulation.");
    }
  }

  function parseDateTimeInput(input: string) {
    const v = (input || "").trim();
    if (!v) return null;
    
    const normalized = v.includes("T") ? v : v.replace(" ", "T");
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  async function reschedule(invoiceId: string, currentIso: string | null) {
    if (!supabase) return;

    const current = currentIso ? new Date(currentIso) : null;
    const currentLabel = current ? current.toISOString().slice(0, 16).replace("T", " ") : "";

    const input = window.prompt(
      "Nouvelle date d'envoi (ex: 2026-02-01 10:30)",
      currentLabel
    );

    if (input === null) return; 
    const d = parseDateTimeInput(input);
    if (!d) {
      alert("Format invalide. Exemple : 2026-02-01 10:30");
      return;
    }

    setErr(null);
    try {
      const iso = d.toISOString();

      await supabase
        .from("ttn_invoice_queue")
        .update({ status: "scheduled", scheduled_at: iso, canceled_at: null })
        .eq("invoice_id", invoiceId);

      await supabase
        .from("invoices")
        .update({ ttn_status: "scheduled", ttn_scheduled_at: iso })
        .eq("id", invoiceId);

      await load();
    } catch (e: any) {
      setErr(e?.message || "Erreur modification de la date.");
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="ftn-card p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Déclarations</div>
            <div className="text-sm text-slate-600">
              Suivi : manuel / en ligne + statut (programmé, envoyé, accepté, refusé).
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="ftn-btn md:hidden" onClick={() => setShowFilters(true)}>
              Filtres
            </button>
            <Link className="ftn-btn" href="/invoices" prefetch={false}>
              Voir factures
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="ftn-input"
            placeholder="Rechercher (société, référence, numéro)…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="ftn-input hidden md:block"
            value={filters.companyId}
            onChange={(e) => setFilters((x) => ({ ...x, companyId: e.target.value }))}
          >
            <option value="all">Toutes les sociétés</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="ftn-input hidden md:block"
            value={filters.month}
            onChange={(e) => setFilters((x) => ({ ...x, month: e.target.value }))}
          >
            <option value="all">Tous les mois</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-2 hidden md:grid grid-cols-4 gap-2">
          <select
            className="ftn-input"
            value={filters.decl}
            onChange={(e) => setFilters((x) => ({ ...x, decl: e.target.value as any }))}
          >
            <option value="all">Déclaration : tout</option>
            <option value="none">Non déclaré</option>
            <option value="manual">Manuel</option>
            <option value="auto">En ligne</option>
          </select>

          <select
            className="ftn-input"
            value={filters.status}
            onChange={(e) => setFilters((x) => ({ ...x, status: e.target.value as any }))}
          >
            <option value="all">Statut (en ligne) : tout</option>
            <option value="not_sent">Non envoyé</option>
            <option value="scheduled">Programmé</option>
            <option value="submitted">Envoyé</option>
            <option value="accepted">Accepté</option>
            <option value="rejected">Refusé</option>
          </select>

          <button className="ftn-btn" onClick={() => load()} disabled={loading}>
            Actualiser
          </button>

          <button
            className="ftn-btn"
            onClick={() =>
              setFilters({
                companyId: "all",
                status: "all",
                month: "all",
                decl: "all",
              })
            }
          >
            Réinitialiser
          </button>
        </div>

        {showFilters ? (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:hidden">
            <div className="w-full rounded-t-2xl bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-semibold">Filtres</div>
                <button className="ftn-btn" onClick={() => setShowFilters(false)}>
                  Fermer
                </button>
              </div>

              <select
                className="ftn-input w-full"
                value={filters.companyId}
                onChange={(e) => setFilters((x) => ({ ...x, companyId: e.target.value }))}
              >
                <option value="all">Toutes les sociétés</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                className="ftn-input w-full"
                value={filters.month}
                onChange={(e) => setFilters((x) => ({ ...x, month: e.target.value }))}
              >
                <option value="all">Tous les mois</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                className="ftn-input w-full"
                value={filters.decl}
                onChange={(e) => setFilters((x) => ({ ...x, decl: e.target.value as any }))}
              >
                <option value="all">Déclaration : tout</option>
                <option value="none">Non déclaré</option>
                <option value="manual">Manuel</option>
                <option value="auto">En ligne</option>
              </select>

              <select
                className="ftn-input w-full"
                value={filters.status}
                onChange={(e) => setFilters((x) => ({ ...x, status: e.target.value as any }))}
              >
                <option value="all">Statut (en ligne) : tout</option>
                <option value="not_sent">Non envoyé</option>
                <option value="scheduled">Programmé</option>
                <option value="submitted">Envoyé</option>
                <option value="accepted">Accepté</option>
                <option value="rejected">Refusé</option>
              </select>

              <div className="flex gap-2">
                <button className="ftn-btn flex-1" onClick={() => load()} disabled={loading}>
                  Appliquer
                </button>
                <button
                  className="ftn-btn flex-1"
                  onClick={() =>
                    setFilters({
                      companyId: "all",
                      status: "all",
                      month: "all",
                      decl: "all",
                    })
                  }
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {err ? <div className="mt-3 ftn-alert">{err}</div> : null}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="ftn-card p-4">
            <div className="text-sm text-slate-600">Total CA (HT)</div>
            <div className="text-2xl font-semibold">{agg.ca.toFixed(3)} TND</div>
          </div>
          <div className="ftn-card p-4">
            <div className="text-sm text-slate-600">Total TVA</div>
            <div className="text-2xl font-semibold">{agg.tva.toFixed(3)} TND</div>
          </div>
          <div className="ftn-card p-4">
            <div className="text-sm text-slate-600">Nombre de documents</div>
            <div className="text-2xl font-semibold">{filtered.length}</div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ftn-table min-w-[980px]">
            <thead>
              <tr>
                <th>Société</th>
                <th>Document</th>
                <th>Date</th>
                <th>CA HT</th>
                <th>TVA</th>
                <th>Déclaration</th>
                <th>Statut (en ligne)</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Chargement…
                  </td>
                </tr>
              ) : filtered.length ? (
                paged.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">
                      <div className="font-medium">{companyName.get(r.company_id) || "—"}</div>
                      <div className="text-xs text-slate-500">{r.invoice_number || r.unique_reference || "—"}</div>
                    </td>
                    <td className="whitespace-nowrap">{docLabel(r.document_type, r.invoice_mode)}</td>
                    <td className="whitespace-nowrap">{(r.issue_date || "").slice(0, 10) || "—"}</td>
                    <td className="whitespace-nowrap">{Number(r.subtotal_ht ?? 0).toFixed(3)}</td>
                    <td className="whitespace-nowrap">{Number(r.total_vat ?? 0).toFixed(3)}</td>
                    <td className="whitespace-nowrap">{declPill(r.declaration_status)}</td>
                    <td className="whitespace-nowrap">{ttnPill(r.ttn_status)}</td>
                    <td className="whitespace-nowrap text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link className="ftn-btn" href={`/invoices/${r.id}`} prefetch={false}>
                          Ouvrir
                        </Link>

                        <button
                          className="ftn-btn"
                          onClick={() => openManual(r)}
                        >
                          Manuel
                        </button>

                        <button className="ftn-btn" onClick={() => setDeclaration(r.id, "none", null, null)}>
                          Réinitialiser
                        </button>

                        {String(r.ttn_status || "").toLowerCase() === "scheduled" ? (
                          <button className="ftn-btn" onClick={() => cancelSchedule(r.id)}>
                            Annuler prog.
                          </button>
                        ) : null}

                        {String(r.ttn_status || "").toLowerCase() === "scheduled" ? (
                          <button className="ftn-btn" onClick={() => reschedule(r.id, r.ttn_scheduled_at)}>
                            Reprogrammer
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Aucun résultat.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {manualOpen ? (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center">
            <div className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl bg-white p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">Déclaration manuelle</div>
                  <div className="text-xs text-slate-600">
                    Renseignez ces informations pour suivre votre déclaration.
                  </div>
                </div>
                <button
                  className="ftn-btn"
                  onClick={() => {
                    setManualOpen(false);
                    setManualInvoiceId(null);
                  }}
                >
                  Fermer
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-xs text-slate-600">Type</div>
                  <select className="ftn-input w-full" value={manualType} onChange={(e) => setManualType(e.target.value)}>
                    <option value="TVA">TVA</option>
                    <option value="CA">CA</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-slate-600">Période (YYYY-MM)</div>
                  <input
                    className="ftn-input w-full"
                    value={manualPeriod}
                    onChange={(e) => setManualPeriod(e.target.value)}
                    placeholder="2026-01"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-slate-600">Date (optionnel)</div>
                  <input
                    type="date"
                    className="ftn-input w-full"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-slate-600">Référence (optionnel)</div>
                  <input
                    className="ftn-input w-full"
                    value={manualRef}
                    onChange={(e) => setManualRef(e.target.value)}
                    placeholder="Ex: Accusé / numéro / référence"
                  />
                </div>
              </div>

              {err ? <div className="text-sm text-rose-600">{err}</div> : null}

              <div className="flex gap-2">
                <button
                  className="ftn-btn flex-1"
                  onClick={() => {
                    setManualOpen(false);
                    setManualInvoiceId(null);
                  }}
                >
                  Annuler
                </button>
                <button className="ftn-btn flex-1" onClick={() => submitManual()}>
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-600">
            Page {pageSafe} / {totalPages}
          </div>
          <div className="flex gap-2">
            <button className="ftn-btn" onClick={() => setPage(1)} disabled={pageSafe <= 1}>
              Début
            </button>
            <button className="ftn-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}>
              Précédent
            </button>
            <button
              className="ftn-btn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
            >
              Suivant
            </button>
            <button className="ftn-btn" onClick={() => setPage(totalPages)} disabled={pageSafe >= totalPages}>
              Fin
            </button>
          </div>
        </div>

<div className="mt-3 text-xs text-slate-500">
          Astuce : filtrez par mois et par statut pour obtenir rapidement votre total TVA/CA par période.
        </div>
      </div>
    </div>
  );
}
