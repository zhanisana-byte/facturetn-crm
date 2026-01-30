"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; company_name: string };

type ItemRow = {
  id?: string;
  line_no: number;
  description: string;
  quantity: number;
  unit_price_ht: number;
  vat_pct: number;
  discount_pct: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function iso4217OK(v: string) {
  const s = (v || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s);
}

function toNum(v: any, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

// IMPORTANT (Tunisie):
// - Total TTC = HT + TVA (sans timbre)
// - Total TTC (y compris timbre) = Net à payer = (HT + TVA) + Timbre
function computeTotals(items: ItemRow[], stampAmount: number) {
  let ht = 0;
  let tva = 0;

  for (const it of items) {
    const qty = toNum(it.quantity, 0);
    const pu = toNum(it.unit_price_ht, 0);
    const disc = Math.max(0, Math.min(100, toNum(it.discount_pct, 0)));
    const vat = Math.max(0, Math.min(100, toNum(it.vat_pct, 0)));

    const lineHT = qty * pu * (1 - disc / 100);
    const lineTVA = lineHT * (vat / 100);

    ht += lineHT;
    tva += lineTVA;
  }

  const subtotal_ht = round3(ht);
  const total_vat = round3(tva);
  const total_ttc = round3(ht + tva); // TTC sans timbre
  const stamp_amount = round3(Math.max(0, toNum(stampAmount, 0)));
  const net_to_pay = round3(total_ttc + stamp_amount); // TTC y compris timbre

  return { subtotal_ht, total_vat, total_ttc, stamp_amount, net_to_pay };
}

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

export default function NewInvoiceClient({ initialEditId }: { initialEditId?: string | null }) {
  const router = useRouter();

  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const editId = initialEditId || null;

  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();

  // Popup erreur / info (au lieu de devoir scroller)
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Sociétés accessibles
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyQuery, setCompanyQuery] = useState("");

  // Form state
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string>("");

  const [uniqueRef, setUniqueRef] = useState<string>("");
  const [documentType, setDocumentType] = useState<"facture" | "devis" | "avoir">("facture");

  const [issueDate, setIssueDate] = useState<string>(todayISO());
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");

  // Client
  const [customerName, setCustomerName] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  // Devise
  const [currency, setCurrency] = useState("TND");

  // Timbre fiscal (obligatoire)
  const [stampAmount, setStampAmount] = useState<number>(1.0);
  const stampEnabled = true;

  // Mode d’envoi: api direct / programmé / manuel
  const [sendMode, setSendMode] = useState<"api_direct" | "scheduled" | "manual">("manual");

  // Signature (choix simple)
  const [signatureProvider, setSignatureProvider] = useState<string>(""); // "" = selon société

  // TTN
  const [scheduledAt, setScheduledAt] = useState<string>(""); // datetime-local
  const [ttnStatus, setTtnStatus] = useState<string>("not_sent");
  const [ttnRef, setTtnRef] = useState<string>("");

  // Items
  const [items, setItems] = useState<ItemRow[]>([
    { line_no: 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 },
  ]);

  const totals = useMemo(() => computeTotals(items, stampAmount), [items, stampAmount]);

  const isLockedTTN = useMemo(() => {
    const s = (ttnStatus || "").toLowerCase();
    return s === "accepted";
  }, [ttnStatus]);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => (c.company_name || "").toLowerCase().includes(q));
  }, [companies, companyQuery]);

  function closePopup() {
    setErr(null);
    setInfo(null);
  }

  function showError(message: string) {
    setInfo(null);
    setErr(message);
    // focus en haut de page visuellement via popup, pas besoin scroll
  }

  function showInfo(message: string) {
    setErr(null);
    setInfo(message);
  }

  function setItem(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => {
      const next = [...prev];
      const curr = next[idx];
      if (!curr) return prev;
      next[idx] = { ...curr, ...patch };
      return next.map((x, i) => ({ ...x, line_no: i + 1 }));
    });
  }

  function addLine() {
    setItems((prev) => [
      ...prev,
      { line_no: prev.length + 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 },
    ]);
  }

  function removeLine(idx: number) {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.length
        ? next.map((x, i) => ({ ...x, line_no: i + 1 }))
        : [{ line_no: 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 }];
    });
  }

  async function loadCompanies() {
    if (!supabase) {
      showError("Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
      return;
    }

    const [{ data: ms, error: e1 }, { data: owned, error: e2 }] = await Promise.all([
      supabase.from("memberships").select("company_id, companies(id, company_name)").eq("is_active", true),
      supabase.from("companies").select("id,company_name").limit(500),
    ]);

    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);

    const map = new Map<string, Company>();

    (ms ?? []).forEach((m: any) => {
      const c = m?.companies;
      const id = String(c?.id ?? m?.company_id ?? "");
      if (!id) return;
      map.set(id, { id, company_name: String(c?.company_name ?? "Société") });
    });

    (owned ?? []).forEach((c: any) => {
      const id = String(c?.id ?? "");
      if (!id) return;
      if (!map.has(id)) map.set(id, { id, company_name: String(c?.company_name ?? "Société") });
    });

    const list = Array.from(map.values()).sort((a, b) => a.company_name.localeCompare(b.company_name));
    setCompanies(list);

    if (!companyId && list[0]?.id) setCompanyId(list[0].id);
  }

  async function loadDefaultSignatureProvider(nextCompanyId: string) {
    if (!supabase || !nextCompanyId) return;
    if (signatureProvider) return;

    try {
      const { data: cred } = await supabase
        .from("ttn_credentials")
        .select("signature_provider")
        .eq("company_id", nextCompanyId)
        .eq("environment", "production")
        .maybeSingle();

      if (cred?.signature_provider) setSignatureProvider(String(cred.signature_provider));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (companyId) loadDefaultSignatureProvider(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function loadEditInvoice(id: string) {
    if (!supabase) return;

    const { data: inv, error: eInv } = await supabase
      .from("invoices")
      .select(
        "id,company_id,unique_reference,document_type,issue_date,invoice_number,customer_name,customer_tax_id,customer_email,customer_phone,customer_address,currency,ttn_status,ttn_scheduled_at,ttn_reference,signature_provider,send_mode,stamp_enabled,stamp_amount"
      )
      .eq("id", id)
      .maybeSingle();

    if (eInv) throw new Error(eInv.message);
    if (!inv?.id) throw new Error("Facture introuvable ou accès refusé.");

    setInvoiceId(String(inv.id));
    setCompanyId(String(inv.company_id));
    setUniqueRef(String(inv.unique_reference ?? ""));
    setDocumentType(((inv.document_type ?? "facture") as any) || "facture");

    setIssueDate(String(inv.issue_date ?? todayISO()));
    setInvoiceNumber(String(inv.invoice_number ?? ""));

    setCustomerName(String(inv.customer_name ?? ""));
    setCustomerTaxId(String(inv.customer_tax_id ?? ""));
    setCustomerEmail(String(inv.customer_email ?? ""));
    setCustomerPhone(String(inv.customer_phone ?? ""));
    setCustomerAddress(String(inv.customer_address ?? ""));

    setCurrency(String(inv.currency ?? "TND"));

    setTtnStatus(String(inv.ttn_status ?? "not_sent"));
    setTtnRef(String(inv.ttn_reference ?? ""));
    setSignatureProvider(String((inv as any).signature_provider ?? ""));

    const sm = String((inv as any).send_mode ?? "manual");
    if (sm === "api_direct" || sm === "scheduled" || sm === "manual") setSendMode(sm as any);

    const sa = toNum((inv as any).stamp_amount, 1.0);
    setStampAmount(sa > 0 ? sa : 1.0);

    const sch = inv.ttn_scheduled_at ? new Date(String(inv.ttn_scheduled_at)) : null;
    if (sch) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const v = `${sch.getFullYear()}-${pad(sch.getMonth() + 1)}-${pad(sch.getDate())}T${pad(
        sch.getHours()
      )}:${pad(sch.getMinutes())}`;
      setScheduledAt(v);
    }

    const { data: its, error: eIt } = await supabase
      .from("invoice_items")
      .select("id,line_no,description,quantity,unit_price_ht,vat_pct,discount_pct")
      .eq("invoice_id", id)
      .order("line_no", { ascending: true });

    if (eIt) throw new Error(eIt.message);

    const lines: ItemRow[] =
      (its ?? []).map((x: any, idx: number) => ({
        id: String(x.id),
        line_no: Number(x.line_no ?? idx + 1),
        description: String(x.description ?? ""),
        quantity: toNum(x.quantity, 1),
        unit_price_ht: toNum(x.unit_price_ht, 0),
        vat_pct: toNum(x.vat_pct, 0),
        discount_pct: toNum(x.discount_pct, 0),
      })) || [];

    setItems(
      lines.length
        ? lines.map((l, i) => ({ ...l, line_no: i + 1 }))
        : [{ line_no: 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 }]
    );
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      closePopup();

      try {
        await loadCompanies();
        if (editId) await loadEditInvoice(editId);
      } catch (e: any) {
        showError(e?.message || "Erreur chargement.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  function validateForm(): string | null {
    if (!companyId) return "Veuillez choisir une société.";
    if (!iso4217OK(currency)) return "Devise invalide. Format ISO 4217 (ex: TND, EUR, USD).";
    if (!issueDate) return "Date d’émission obligatoire.";
    if (!customerName.trim()) return "Nom client obligatoire.";

    if (!stampEnabled) return "Timbre fiscal obligatoire.";
    if (!(toNum(stampAmount, 0) > 0)) return "Montant timbre fiscal obligatoire (> 0).";

    const hasLine = items.some((it) => it.description.trim() && toNum(it.quantity, 0) > 0);
    if (!hasLine) return "Ajoutez au moins une ligne (description + quantité).";

    // Programmé => date/heure obligatoire
    if (sendMode === "scheduled") {
      if (!scheduledAt) return "Date/heure de programmation obligatoire.";
      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime())) return "Date/heure de programmation invalide.";
    }

    return null;
  }

  async function save() {
    closePopup();

    if (!supabase) {
      showError("Supabase non configuré.");
      return;
    }

    if (isLockedTTN) {
      showError("Impossible : document déjà accepté/validé par TTN (verrouillé).");
      return;
    }

    const v = validateForm();
    if (v) {
      showError(v);
      return;
    }

    startSaving(async () => {
      try {
        const now = new Date().toISOString();

        const scheduledISO = sendMode === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null;

        // Statut TTN cohérent (à votre logique future)
        const nextTtnStatus = sendMode === "scheduled" ? "scheduled" : "not_sent";

        const payload: any = {
          company_id: companyId,
          unique_reference: uniqueRef.trim() || null,
          document_type: documentType,
          invoice_mode: "normal",

          issue_date: issueDate || todayISO(),
          invoice_number: invoiceNumber.trim() || null,

          customer_name: customerName.trim(),
          customer_tax_id: customerTaxId.trim() || null,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          customer_address: customerAddress.trim() || null,

          currency: currency.trim().toUpperCase(),

          // Totaux (Tunisie)
          subtotal_ht: totals.subtotal_ht,
          total_vat: totals.total_vat,
          total_ttc: totals.total_ttc, // HT + TVA (sans timbre)

          stamp_enabled: true,
          stamp_amount: totals.stamp_amount,
          net_to_pay: totals.net_to_pay, // TTC y compris timbre

          send_mode: sendMode,
          ttn_status: nextTtnStatus,
          ttn_scheduled_at: scheduledISO,
          scheduled_send_at: scheduledISO,

          // devis => pas de signature
          signature_provider: documentType === "devis" ? null : signatureProvider.trim() || null,

          updated_at: now,
        };

        let savedId = invoiceId;

        if (invoiceId) {
          const { error } = await supabase.from("invoices").update(payload).eq("id", invoiceId);
          if (error) throw new Error(error.message);
          savedId = invoiceId;
        } else {
          const { data, error } = await supabase.from("invoices").insert(payload).select("id").single();
          if (error) throw new Error(error.message);
          savedId = String((data as any)?.id);
          setInvoiceId(savedId);
        }

        if (!savedId) throw new Error("ID facture manquant.");

        // Replace items
        await supabase.from("invoice_items").delete().eq("invoice_id", savedId);

        const cleanItems = items
          .map((it, idx) => ({
            invoice_id: savedId,
            line_no: idx + 1,
            description: it.description.trim(),
            quantity: toNum(it.quantity, 1),
            unit_price_ht: toNum(it.unit_price_ht, 0),
            vat_pct: toNum(it.vat_pct, 0),
            discount_pct: toNum(it.discount_pct, 0),
          }))
          .filter((x) => x.description && x.quantity > 0);

        if (cleanItems.length) {
          const { error } = await supabase.from("invoice_items").insert(cleanItems);
          if (error) throw new Error(error.message);
        }

        showInfo("Enregistré ✅");

        // ✅ Après enregistrement : aller vers la page facture (PAS /signature)
        router.push(`/invoices/${savedId}`);
      } catch (e: any) {
        showError(e?.message || "Erreur enregistrement.");
      }
    });
  }

  const headerTitle = editId ? "Modifier document" : "Nouveau document";

  return (
    <div className="p-6 space-y-4">
      {/* POPUP erreurs/infos */}
      {(err || info) ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={closePopup} />
          <div className="relative w-full max-w-xl rounded-2xl border bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold">
                  {err ? "Erreur" : "Information"}
                </div>
                <div className={`mt-1 text-sm ${err ? "text-rose-800" : "text-emerald-900"}`}>
                  {err || info}
                </div>
              </div>
              <button className="ftn-btn ftn-btn-ghost" type="button" onClick={closePopup}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="ftn-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">{headerTitle}</div>
            <div className="text-sm text-slate-600">
              Facture / Devis / Avoir — Devise ISO 4217 + timbre fiscal obligatoire
            </div>
          </div>

          <div className="flex gap-2">
            <Link className="ftn-btn ftn-btn-ghost" href="/invoices" prefetch={false}>
              ← Retour factures
            </Link>
            {invoiceId ? (
              <Link className="ftn-btn" href={`/invoices/${invoiceId}`} prefetch={false}>
                Voir la facture
              </Link>
            ) : null}
          </div>
        </div>

        {loading ? <div className="mt-4 text-sm">Chargement...</div> : null}

        {/* Statuts TTN */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {ttnStatus ? (
            <>
              {ttnStatus.toLowerCase() === "accepted"
                ? pill("TTN accepté (verrouillé)", "ok")
                : ttnStatus.toLowerCase() === "rejected"
                ? pill("TTN rejeté", "bad")
                : ttnStatus.toLowerCase() === "submitted"
                ? pill("TTN envoyé", "warn")
                : ttnStatus.toLowerCase() === "scheduled"
                ? pill("TTN programmé", "warn")
                : pill("TTN non envoyé", "neutral")}
              {ttnRef ? <span className="text-xs text-slate-500">Ref: {ttnRef}</span> : null}
            </>
          ) : null}
        </div>

        {/* Société */}
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Rechercher société</label>
            <input
              className="ftn-input mt-1 w-full"
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              placeholder="Tapez un nom..."
              disabled={isLockedTTN}
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium">Société</label>
            <select
              className="ftn-input mt-1 w-full"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              disabled={isLockedTTN}
            >
              <option value="">— Sélectionner —</option>
              {filteredCompanies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Type + Devise */}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Type document</label>
            <select
              className="ftn-input mt-1 w-full"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as any)}
              disabled={isLockedTTN}
            >
              <option value="facture">Facture</option>
              <option value="devis">Devis</option>
              <option value="avoir">Avoir</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">
              Devise <span className="text-xs text-slate-500">(ISO 4217)</span>
            </label>
            <input
              className="ftn-input mt-1 w-full"
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="TND"
              maxLength={3}
              disabled={isLockedTTN}
            />
            {!iso4217OK(currency) ? (
              <div className="text-xs text-rose-700 mt-1">Devise invalide (ex: TND, EUR, USD).</div>
            ) : null}
          </div>
        </div>

        {/* Renommer + dates */}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Renommer (référence interne)</label>
            <input
              className="ftn-input mt-1 w-full"
              value={uniqueRef}
              onChange={(e) => setUniqueRef(e.target.value)}
              placeholder="ex: Sana-Janv-2026"
              disabled={isLockedTTN}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Date émission</label>
            <input
              type="date"
              className="ftn-input mt-1 w-full"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              disabled={isLockedTTN}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Numéro (optionnel)</label>
            <input
              className="ftn-input mt-1 w-full"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Auto si vide"
              disabled={isLockedTTN}
            />
          </div>
        </div>

        {/* Client */}
        <div className="mt-6">
          <div className="font-semibold">Client</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Nom client *</label>
              <input
                className="ftn-input mt-1 w-full"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nom / Raison sociale"
                disabled={isLockedTTN}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Matricule fiscal (optionnel)</label>
              <input
                className="ftn-input mt-1 w-full"
                value={customerTaxId}
                onChange={(e) => setCustomerTaxId(e.target.value)}
                placeholder="MF..."
                disabled={isLockedTTN}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Email (optionnel)</label>
              <input
                className="ftn-input mt-1 w-full"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="client@email.com"
                disabled={isLockedTTN}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Téléphone (optionnel)</label>
              <input
                className="ftn-input mt-1 w-full"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+216..."
                disabled={isLockedTTN}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-sm font-medium">Adresse (optionnel)</label>
              <input
                className="ftn-input mt-1 w-full"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Adresse complète"
                disabled={isLockedTTN}
              />
            </div>
          </div>
        </div>

        {/* Lignes */}
        <div className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">Lignes</div>
            <button className="ftn-btn" type="button" onClick={addLine} disabled={isLockedTTN}>
              + Ajouter ligne
            </button>
          </div>

          <div className="mt-3 overflow-auto rounded-2xl border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left font-medium px-3 py-3 w-[40px]">#</th>
                  <th className="text-left font-medium px-3 py-3 min-w-[260px]">Description</th>
                  <th className="text-right font-medium px-3 py-3 w-[110px]">Qté</th>
                  <th className="text-right font-medium px-3 py-3 w-[140px]">PU HT</th>
                  <th className="text-right font-medium px-3 py-3 w-[110px]">TVA %</th>
                  <th className="text-right font-medium px-3 py-3 w-[120px]">Remise %</th>
                  <th className="text-right font-medium px-3 py-3 w-[80px]">—</th>
                </tr>
              </thead>

              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{idx + 1}</td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full"
                        value={it.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })}
                        placeholder="Produit / service..."
                        disabled={isLockedTTN}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full text-right"
                        value={String(it.quantity)}
                        onChange={(e) => setItem(idx, { quantity: toNum(e.target.value, 0) })}
                        disabled={isLockedTTN}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full text-right"
                        value={String(it.unit_price_ht)}
                        onChange={(e) => setItem(idx, { unit_price_ht: toNum(e.target.value, 0) })}
                        disabled={isLockedTTN}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full text-right"
                        value={String(it.vat_pct)}
                        onChange={(e) => setItem(idx, { vat_pct: toNum(e.target.value, 0) })}
                        disabled={isLockedTTN}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full text-right"
                        value={String(it.discount_pct)}
                        onChange={(e) => setItem(idx, { discount_pct: toNum(e.target.value, 0) })}
                        disabled={isLockedTTN}
                      />
                    </td>

                    <td className="px-3 py-2 text-right">
                      <button className="ftn-btn ftn-btn-danger" type="button" onClick={() => removeLine(idx)} disabled={isLockedTTN}>
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux – ordre Tunisie: HT, TVA, Timbre, TTC(y compris timbre) */}
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="ftn-card p-4">
              <div className="text-sm opacity-70">Total HT</div>
              <div className="text-2xl font-extrabold mt-1">
                {totals.subtotal_ht.toFixed(3)} {currency}
              </div>
            </div>

            <div className="ftn-card p-4">
              <div className="text-sm opacity-70">TVA</div>
              <div className="text-2xl font-extrabold mt-1">
                {totals.total_vat.toFixed(3)} {currency}
              </div>
            </div>

            <div className="ftn-card p-4">
              <div className="text-sm opacity-70">Timbre fiscal</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="ftn-input w-[120px] text-right"
                  value={String(stampAmount)}
                  onChange={(e) => setStampAmount(toNum(e.target.value, 1.0))}
                  disabled={isLockedTTN}
                />
                <span className="text-sm font-semibold">{currency}</span>
              </div>
            </div>

            <div className="ftn-card p-4 border-2 border-emerald-300 bg-emerald-50/40">
              <div className="text-sm font-semibold text-emerald-800">
                Total TTC (y compris timbre fiscal)
              </div>
              <div className="text-3xl font-extrabold mt-1 text-emerald-900">
                {totals.net_to_pay.toFixed(3)} {currency}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                (HT + TVA = {totals.total_ttc.toFixed(3)} {currency})
              </div>
            </div>
          </div>
        </div>

        {/* Envoi TTN */}
        <div className="mt-6">
          <div className="font-semibold">Envoi TTN</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Mode</label>
              <select
                className="ftn-input mt-1 w-full"
                value={sendMode}
                onChange={(e) => setSendMode(e.target.value as any)}
                disabled={isLockedTTN}
              >
                <option value="api_direct">Envoi API direct</option>
                <option value="scheduled">Programmer envoi</option>
                <option value="manual">Manuel (non envoyé)</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Signature</label>
              <select
                className="ftn-input mt-1 w-full"
                value={signatureProvider}
                onChange={(e) => setSignatureProvider(e.target.value)}
                disabled={isLockedTTN || documentType === "devis"}
              >
                <option value="">Selon la société</option>
                <option value="usb_agent">Clé sur ordinateur</option>
                <option value="digigo">SMS (DigiGO)</option>
                <option value="none">Sans signature</option>
              </select>

              {documentType === "devis" ? (
                <div className="mt-1 text-xs opacity-70">Pour un devis, la signature TTN n’est pas nécessaire.</div>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium">Date/heure (si programmé)</label>
              <input
                type="datetime-local"
                className="ftn-input mt-1 w-full"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                disabled={isLockedTTN || sendMode !== "scheduled"}
              />
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-500">
            Statut “TTN validé” = <b>ttn_status = accepted</b>. Quand accepté → document verrouillé.
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">
            Champs obligatoires : <b>Société</b>, <b>Nom client</b>, <b>Devise</b>, <b>Timbre fiscal</b>, <b>au moins 1 ligne</b>.
          </div>

          <div className="flex gap-2">
            <button className="ftn-btn" onClick={save} disabled={saving || loading || isLockedTTN} type="button">
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>

            <Link className="ftn-btn ftn-btn-ghost" href="/invoices" prefetch={false}>
              Annuler
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
