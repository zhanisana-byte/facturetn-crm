"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; company_name: string };
type Line = { description: string; qty: number; price: number; vat: number; discount: number };

function genRef() {
  const rnd = Math.random().toString(36).slice(2, 10).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  return `TTN-${ts}-${rnd}`;
}

export default function NewInvoiceClient() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const urlCompany = sp.get("company") || "";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [invoiceMode, setInvoiceMode] = useState<"normal" | "permanente" | null>(null);
  const [recurringDay, setRecurringDay] = useState<string>("1");

  const [companyId, setCompanyId] = useState(urlCompany);

  const [documentType, setDocumentType] = useState<"facture" | "devis" | "avoir">("facture");

  const [issueDate, setIssueDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [periodFrom, setPeriodFrom] = useState<string>("");
  const [periodTo, setPeriodTo] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [uniqueRef, setUniqueRef] = useState<string>(() => genRef());
  const [amountInWords, setAmountInWords] = useState<string>("");
  const [stampEnabled, setStampEnabled] = useState<boolean>(false);
  const [stampAmount, setStampAmount] = useState<number>(0);

  const [customerName, setCustomerName] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [codeClient, setCodeClient] = useState(""); // optionnel

  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const [lines, setLines] = useState<Line[]>([
    { description: "", qty: 1, price: 0, vat: 19, discount: 0 },
  ]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setCompanies(data as Company[]);
        // auto-select if only one company and no urlCompany
        if (!urlCompany && data.length === 1) setCompanyId((data[0] as any).id);
      }

      if (urlCompany) setCompanyId(urlCompany);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply company defaults (safe: table may not exist yet)
  useEffect(() => {
    (async () => {
      if (!companyId) return;

      // Try to load default VAT/stamp for this company
      const { data: settings, error } = await supabase
        .from("company_ttn_settings")
        .select("vat_default, stamp_enabled_default, stamp_amount_default")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error || !settings) return;

      // Default VAT: only update lines that are still empty/initial
      if (typeof settings.vat_default === "number") {
        setLines((prev) =>
          prev.map((l) =>
            (l.description || "").trim() === "" ? { ...l, vat: settings.vat_default } : l
          )
        );
      }

      // Default stamp
      if (typeof settings.stamp_enabled_default === "boolean") {
        setStampEnabled(settings.stamp_enabled_default);
      }
      if (typeof settings.stamp_amount_default === "number") {
        // ✅ FIX: stampAmount est un number
        setStampAmount(Number(settings.stamp_amount_default ?? 0));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((sum, l) => {
      const base = (Number(l.qty) || 0) * (Number(l.price) || 0);
      const disc = base * ((Number(l.discount) || 0) / 100);
      return sum + Math.max(0, base - disc);
    }, 0);

    const totalVat = lines.reduce((sum, l) => {
      const base = (Number(l.qty) || 0) * (Number(l.price) || 0);
      const disc = base * ((Number(l.discount) || 0) / 100);
      const ht = Math.max(0, base - disc);
      return sum + ht * ((Number(l.vat) || 0) / 100);
    }, 0);

    const totalTtc = subtotal + totalVat + (stampEnabled ? (Number(stampAmount) || 0) : 0);

    return { subtotal, totalVat, totalTtc };
  }, [lines, stampEnabled, stampAmount]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, { description: "", qty: 1, price: 0, vat: 19, discount: 0 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    if (!companyId) return alert("Choisis une société d’abord.");
    if (!customerName.trim()) return alert("Nom client requis.");

    // Cohérence période TTN
    if ((periodFrom && !periodTo) || (!periodFrom && periodTo)) {
      return alert("Période TTN: remplis Du et Au.");
    }
    if (periodFrom && periodTo && periodFrom > periodTo) {
      return alert("Période TTN invalide (Du > Au).");
    }

    setLoading(true);

    const qrPayload = JSON.stringify({
      ref: uniqueRef,
      doc: documentType,
      date: issueDate,
      period_from: periodFrom || null,
      period_to: periodTo || null,
      company_id: companyId,
      customer: customerName,
      total_ttc: totals.totalTtc,
      currency: "TND",
    });

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({
        company_id: companyId,

        document_type: documentType,
        issue_date: issueDate,
        due_date: dueDate || null,

        period_from: periodFrom || null,
        period_to: periodTo || null,
        unique_reference: uniqueRef || null,
        qr_payload: qrPayload,
        amount_in_words: amountInWords || null,

        currency: "TND",
        notes: notes || null,

        customer_name: customerName,
        customer_tax_id: customerTaxId,
        customer_address: customerAddress,
        customer_email: customerEmail,
        customer_phone: customerPhone,

        // Optionnel: stocker code client dans notes si tu veux, sinon ajouter colonne plus tard
        // (on le garde côté UI pour future TTN)
        billing_period: null,

        stamp_enabled: stampEnabled,
        stamp_amount: stampEnabled ? Number(stampAmount) || 0 : 0,

        payment_status: "unpaid",
        ttn_status: "not_sent",

        subtotal_ht: totals.subtotal,
        total_vat: totals.totalVat,
        total_ttc: totals.totalTtc,
        net_to_pay: totals.totalTtc,
        total: totals.totalTtc,
      })
      .select("id")
      .single();

    if (invErr || !inv?.id) {
      setLoading(false);
      alert(invErr?.message || "Erreur création facture");
      return;
    }

    const invoiceId = inv.id as string;

    const itemsPayload = lines.map((l, idx) => {
      const base = (Number(l.qty) || 0) * (Number(l.price) || 0);
      const disc = base * ((Number(l.discount) || 0) / 100);
      const ht = Math.max(0, base - disc);
      const vatAmount = ht * ((Number(l.vat) || 0) / 100);
      const ttc = ht + vatAmount;

      return {
        invoice_id: invoiceId,
        line_no: idx + 1,
        description: l.description || "—",
        quantity: Number(l.qty) || 0,
        unit_price_ht: Number(l.price) || 0,
        discount_pct: Number(l.discount) || 0,
        vat_pct: Number(l.vat) || 0,
        line_total_ht: ht,
        line_vat_amount: vatAmount,
        line_total_ttc: ttc,
      };
    });

    const { error: itemsErr } = await supabase.from("invoice_items").insert(itemsPayload);

    setLoading(false);

    if (itemsErr) {
      alert("Facture créée mais erreur items: " + itemsErr.message);
      router.push(`/invoices/${invoiceId}`);
      return;
    }

    // Optional: register as recurring template (safe if table not created yet)
    if (invoiceMode === "permanente") {
      try {
        const day = Math.min(28, Math.max(1, Number(recurringDay) || 1));
        await supabase.from("recurring_templates").insert({
          company_id: companyId,
          invoice_id: invoiceId,
          frequency: "monthly",
          month_day: day,
          is_active: true,
        });
      } catch {
        // ignore (SQL will be added manually)
      }
    }

    router.push(`/invoices/${invoiceId}`);
  }

  if (!invoiceMode) {
    return (
      <div className="ftn-mode-wrap">
        <div className="ftn-mode-title">Choisir le type de facture</div>
        <div className="ftn-mode-sub">Avant de remplir les champs TTN, choisis le mode.</div>

        <div className="ftn-mode-grid">
          <button className="ftn-mode-card" onClick={() => setInvoiceMode("normal")}>
            <div className="ftn-mode-badge">Normal</div>
            <div className="ftn-mode-h">Facture classique</div>
            <div className="ftn-mode-p">Création immédiate, numérotation + PDF/XML ensuite.</div>
          </button>

          <button className="ftn-mode-card" onClick={() => setInvoiceMode("permanente")}>
            <div className="ftn-mode-badge">Permanente</div>
            <div className="ftn-mode-h">Facture mensuelle</div>
            <div className="ftn-mode-p">Modèle récurrent (génération automatique après SQL/cron).</div>
          </button>
        </div>

        <div className="ftn-muted mt-3">
          Astuce: tu peux commencer en “Normal” et activer “Permanente” après validation du module récurrent.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="grid gap-4">
        {/* En-tête TTN */}
        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Données TTN (copie conforme)</div>
              <div className="text-xs text-slate-500">Type, période, référence unique, échéance…</div>
            </div>
            <button
              type="button"
              className="px-4 py-2 rounded-2xl border border-slate-200 text-sm hover:bg-slate-50"
              onClick={() => setUniqueRef(genRef())}
            >
              Regénérer référence
            </button>
          </div>

          <div className="ftn-mode-bar">
            <div className="ftn-chip">
              Mode: <b>{invoiceMode === "permanente" ? "Permanente" : "Normale"}</b>
            </div>

            {invoiceMode === "permanente" && (
              <div className="ftn-rec-row">
                <div>
                  <label className="ftn-label">Jour de génération (1-28)</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    className="ftn-input"
                    value={recurringDay}
                    onChange={(e) => setRecurringDay(e.target.value)}
                  />
                </div>
                <div className="ftn-muted mt-6">
                  Modèle mensuel (la génération auto sera activée après ajout SQL/cron).
                </div>
              </div>
            )}

            <button
              type="button"
              className="ftn-link"
              onClick={() => setInvoiceMode(null)}
              title="Changer le mode"
            >
              Changer
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="ftn-label">Société</label>
              <select className="ftn-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— Choisir —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="ftn-label">Type document</label>
              <select className="ftn-input" value={documentType} onChange={(e) => setDocumentType(e.target.value as any)}>
                <option value="facture">Facture</option>
                <option value="devis">Devis</option>
                <option value="avoir">Avoir</option>
              </select>
            </div>

            <div>
              <label className="ftn-label">Date émission</label>
              <input className="ftn-input" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>

            <div>
              <label className="ftn-label">Période du</label>
              <input className="ftn-input" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </div>

            <div>
              <label className="ftn-label">Période au</label>
              <input className="ftn-input" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </div>

            <div>
              <label className="ftn-label">Date limite paiement</label>
              <input className="ftn-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="ftn-label">Référence unique (TTN)</label>
              <input className="ftn-input" value={uniqueRef} onChange={(e) => setUniqueRef(e.target.value)} />
            </div>

            <div>
              <label className="ftn-label">Code client (optionnel)</label>
              <input className="ftn-input" value={codeClient} onChange={(e) => setCodeClient(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Client */}
        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="text-sm font-semibold">Client</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="ftn-label">Nom / Raison sociale *</label>
              <input className="ftn-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="ftn-label">Matricule fiscal</label>
              <input className="ftn-input" value={customerTaxId} onChange={(e) => setCustomerTaxId(e.target.value)} />
            </div>
            <div>
              <label className="ftn-label">Email</label>
              <input className="ftn-input" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            <div>
              <label className="ftn-label">Téléphone</label>
              <input className="ftn-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="ftn-label">Adresse</label>
              <input className="ftn-input" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Lignes */}
        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Lignes</div>
            <button type="button" className="px-4 py-2 rounded-2xl border border-slate-200 text-sm hover:bg-slate-50" onClick={addLine}>
              + Ajouter ligne
            </button>
          </div>

          <div className="grid gap-3">
            {lines.map((l, i) => (
              <div key={i} className="grid md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-5">
                  <label className="ftn-label">Désignation</label>
                  <input className="ftn-input" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="ftn-label">Qté</label>
                  <input className="ftn-input" type="number" value={l.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} />
                </div>
                <div className="md:col-span-2">
                  <label className="ftn-label">PU HT</label>
                  <input className="ftn-input" type="number" value={l.price} onChange={(e) => updateLine(i, { price: Number(e.target.value) })} />
                </div>
                <div className="md:col-span-1">
                  <label className="ftn-label">TVA%</label>
                  <input className="ftn-input" type="number" value={l.vat} onChange={(e) => updateLine(i, { vat: Number(e.target.value) })} />
                </div>
                <div className="md:col-span-1">
                  <label className="ftn-label">Rem%</label>
                  <input className="ftn-input" type="number" value={l.discount} onChange={(e) => updateLine(i, { discount: Number(e.target.value) })} />
                </div>
                <div className="md:col-span-1 flex justify-end">
                  {lines.length > 1 && (
                    <button type="button" className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50" onClick={() => removeLine(i)}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totaux */}
        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="text-sm font-semibold">Totaux</div>

          <div className="grid md:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">Total HT</div>
              <div className="text-lg font-semibold">{totals.subtotal.toFixed(3)} TND</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">TVA</div>
              <div className="text-lg font-semibold">{totals.totalVat.toFixed(3)} TND</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">Timbre</div>
              <div className="text-lg font-semibold">{(stampEnabled ? (Number(stampAmount) || 0) : 0).toFixed(3)} TND</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">Net à payer</div>
              <div className="text-lg font-semibold">{totals.totalTtc.toFixed(3)} TND</div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="flex items-center gap-3">
              <input
                id="stamp"
                type="checkbox"
                className="h-4 w-4"
                checked={stampEnabled}
                onChange={(e) => setStampEnabled(e.target.checked)}
              />
              <label htmlFor="stamp" className="text-sm font-medium">
                Activer timbre
              </label>
            </div>

            <div>
              <label className="ftn-label">Montant timbre (TND)</label>
              <input
                className="ftn-input"
                type="number"
                value={stampAmount}
                onChange={(e) => setStampAmount(Number(e.target.value))}
                disabled={!stampEnabled}
              />
            </div>

            <div>
              <label className="ftn-label">Montant en lettres (optionnel)</label>
              <input className="ftn-input" value={amountInWords} onChange={(e) => setAmountInWords(e.target.value)} />
            </div>

            <div className="md:col-span-3">
              <label className="ftn-label">Notes (optionnel)</label>
              <input className="ftn-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <button className="ftn-btn" disabled={loading} onClick={save}>
            {loading ? "Création..." : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}
