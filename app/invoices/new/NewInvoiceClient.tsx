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
function clampDay(v: any) {
  const n = Number(v) || 1;
  return Math.min(28, Math.max(1, n));
}

export default function NewInvoiceClient() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const urlCompany = sp.get("company") || "";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(urlCompany);

  // ✅ Step: société -> mode -> form
  const [invoiceMode, setInvoiceMode] = useState<"normal" | "permanente" | null>(null);
  const [recurringDay, setRecurringDay] = useState<string>("1");

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
  const [codeClient, setCodeClient] = useState("");

  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const [lines, setLines] = useState<Line[]>([
    { description: "", qty: 1, price: 0, vat: 19, discount: 0 },
  ]);

  const [loadErr, setLoadErr] = useState<string>("");

  // ✅ Load companies via memberships (RLS-safe)
  useEffect(() => {
    (async () => {
      setLoadErr("");

      const { data, error } = await supabase
        .from("memberships")
        .select("company_id, companies(id, company_name)")
        .eq("is_active", true);

      if (error) {
        setLoadErr(error.message);
        return;
      }

      const list: Company[] = (data ?? [])
        .map((m: any) => ({
          id: String(m.companies?.id ?? m.company_id ?? ""),
          company_name: String(m.companies?.company_name ?? "Société"),
        }))
        .filter((c) => Boolean(c.id));

      setCompanies(list);

      // URL param wins if valid
      if (urlCompany) {
        const ok = list.some((c) => c.id === urlCompany);
        setCompanyId(ok ? urlCompany : "");
        return;
      }

      // auto-select if only one
      if (list.length === 1) setCompanyId(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ Load defaults (stamp + VAT) for selected company
  useEffect(() => {
    (async () => {
      if (!companyId) return;

      // company_settings (schema OK)
      const { data: cs } = await supabase
        .from("company_settings")
        .select("default_stamp_enabled, default_stamp_amount")
        .eq("company_id", companyId)
        .maybeSingle();

      if (cs) {
        if (typeof cs.default_stamp_enabled === "boolean") setStampEnabled(cs.default_stamp_enabled);
        if (typeof cs.default_stamp_amount === "number") setStampAmount(Number(cs.default_stamp_amount ?? 0));
      }

      // company_ttn_settings (optional)
      const { data: ttn } = await supabase
        .from("company_ttn_settings")
        .select("vat_default, stamp_enabled, stamp_amount")
        .eq("company_id", companyId)
        .maybeSingle();

      if (ttn && typeof ttn.vat_default === "number") {
        setLines((prev) =>
          prev.map((l) =>
            (l.description || "").trim() === "" ? { ...l, vat: ttn.vat_default } : l
          )
        );
      }
      if (ttn && typeof ttn.stamp_enabled === "boolean") setStampEnabled(ttn.stamp_enabled);
      if (ttn && typeof ttn.stamp_amount === "number") setStampAmount(Number(ttn.stamp_amount ?? 0));
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

  function validate(): string {
    if (!companyId) return "Choisis une société d’abord.";
    if (!companies.some((c) => c.id === companyId)) return "Société invalide.";
    if (!invoiceMode) return "Choisis le type de facture (Normal / Permanente).";
    if (!customerName.trim()) return "Nom client requis.";

    if ((periodFrom && !periodTo) || (!periodFrom && periodTo)) {
      return "Période TTN: remplis Du et Au.";
    }
    if (periodFrom && periodTo && periodFrom > periodTo) {
      return "Période TTN invalide (Du > Au).";
    }

    const hasAtLeastOneLine = lines.some((l) => (l.description || "").trim() !== "");
    if (!hasAtLeastOneLine) return "Ajoute au moins une ligne avec une désignation.";

    return "";
  }

  async function save() {
    const msg = validate();
    if (msg) return alert(msg);

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
        customer_tax_id: customerTaxId || null,
        customer_address: customerAddress || null,
        customer_email: customerEmail || null,
        customer_phone: customerPhone || null,

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

    const invoiceId = String(inv.id);

    const itemsPayload = lines
      .filter((l) => (l.description || "").trim() !== "")
      .map((l, idx) => {
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

    if (itemsErr) {
      setLoading(false);
      alert("Facture créée mais erreur items: " + itemsErr.message);
      router.push(`/invoices/${invoiceId}`);
      return;
    }

    // ✅ Permanente: create recurring template (schema compatible)
    if (invoiceMode === "permanente") {
      try {
        const day = clampDay(recurringDay);

        const { data: tpl, error: tplErr } = await supabase
          .from("recurring_templates")
          .insert({
            company_id: companyId,
            template_name: `Template ${uniqueRef}`,
            customer_name: customerName,
            customer_tax_id: customerTaxId || null,
            customer_email: customerEmail || null,
            customer_phone: customerPhone || null,
            customer_address: customerAddress || null,
            day_of_month: day,
            is_active: true,
            vat_rate_default: 19,
            stamp_enabled: stampEnabled,
            stamp_amount: stampEnabled ? Number(stampAmount) || 0 : 0,
          })
          .select("id")
          .single();

        if (!tplErr && tpl?.id) {
          const templateId = String(tpl.id);

          const tplItems = lines
            .filter((l) => (l.description || "").trim() !== "")
            .map((l, idx) => ({
              template_id: templateId,
              line_no: idx + 1,
              description: l.description || "—",
              quantity: Number(l.qty) || 1,
              unit_price: Number(l.price) || 0,
              vat_rate: Number(l.vat) || 19,
            }));

          if (tplItems.length) {
            await supabase.from("recurring_template_items").insert(tplItems);
          }
        }
      } catch {
        // ignore
      }
    }

    setLoading(false);
    router.push(`/invoices/${invoiceId}`); // ✅ Télécharger PDF/XML dans la page facture
  }

  // =========================
  // UI STATES
  // =========================
  if (loadErr) {
    return (
      <div className="ftn-card">
        <div className="text-lg font-extrabold">Erreur</div>
        <div className="ftn-alert mt-3">{loadErr}</div>
        <div className="mt-4">
          <button className="ftn-btn" onClick={() => router.push("/invoices")}>Retour</button>
        </div>
      </div>
    );
  }

  // ✅ BLOQUÉ si aucune société (pas de lien créer société)
  if (companies.length === 0) {
    return (
      <div className="ftn-card">
        <div className="text-lg font-extrabold">Impossible de créer une facture</div>
        <p className="ftn-muted mt-1">
          Aucune société n’est associée à ce compte. La création de facture est désactivée.
        </p>
        <div className="mt-4">
          <button className="ftn-btn" onClick={() => router.push("/invoices")}>Retour</button>
        </div>
      </div>
    );
  }

  // ✅ STEP 1: choisir société obligatoire si plusieurs
  const mustPickCompany = companies.length > 1 && !companyId;
  if (mustPickCompany) {
    return (
      <div className="ftn-card">
        <div className="text-lg font-extrabold">Nouvelle facture</div>
        <p className="ftn-muted mt-1">Choisis une société pour continuer.</p>

        <div className="mt-4">
          <label className="ftn-label">Société *</label>
          <select className="ftn-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">— Choisir —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex gap-2">
          <button className="ftn-btn" disabled={!companyId} onClick={() => setInvoiceMode(null)}>
            Continuer
          </button>
          <button className="ftn-btn ftn-btn-ghost" onClick={() => router.push("/invoices")}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  // ✅ STEP 2: choisir mode
  if (!invoiceMode) {
    return (
      <div className="ftn-mode-wrap">
        <div className="ftn-mode-title">Choisir le type de facture</div>
        <div className="ftn-mode-sub">
          Société : <b>{companies.find((c) => c.id === companyId)?.company_name ?? "—"}</b>
        </div>

        {companies.length > 1 && (
          <div className="mt-3">
            <label className="ftn-label">Changer société</label>
            <select className="ftn-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">— Choisir —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="ftn-mode-grid mt-4">
          <button className="ftn-mode-card" onClick={() => setInvoiceMode("normal")}>
            <div className="ftn-mode-badge">Normal</div>
            <div className="ftn-mode-h">Facture classique</div>
            <div className="ftn-mode-p">Création immédiate, PDF/XML ensuite.</div>
          </button>

          <button className="ftn-mode-card" onClick={() => setInvoiceMode("permanente")}>
            <div className="ftn-mode-badge">Permanente</div>
            <div className="ftn-mode-h">Facture mensuelle</div>
            <div className="ftn-mode-p">Sauvegarde + modèle récurrent.</div>
          </button>
        </div>

        <div className="mt-4">
          <button className="ftn-btn ftn-btn-ghost" onClick={() => router.push("/invoices")}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  // ✅ STEP 3: form
  return (
    <div className="max-w-5xl">
      <div className="grid gap-4">
        {/* En-tête */}
        <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Nouvelle facture</div>
              <div className="text-xs text-slate-500">
                Société : <b>{companies.find((c) => c.id === companyId)?.company_name ?? "—"}</b> • Mode :{" "}
                <b>{invoiceMode === "permanente" ? "Permanente" : "Normale"}</b>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="px-4 py-2 rounded-2xl border border-slate-200 text-sm hover:bg-slate-50"
                onClick={() => setUniqueRef(genRef())}
              >
                Regénérer référence
              </button>

              <button
                type="button"
                className="px-4 py-2 rounded-2xl border border-slate-200 text-sm hover:bg-slate-50"
                onClick={() => setInvoiceMode(null)}
              >
                Changer mode
              </button>
            </div>
          </div>

          {invoiceMode === "permanente" && (
            <div className="grid md:grid-cols-3 gap-3">
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
              <div className="md:col-span-2 ftn-muted mt-6">
                Un modèle sera créé dans <b>recurring_templates</b>.
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-3">
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
              <label className="ftn-label">Date limite paiement</label>
              <input className="ftn-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
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
              <label className="ftn-label">Code client (optionnel)</label>
              <input className="ftn-input" value={codeClient} onChange={(e) => setCodeClient(e.target.value)} />
            </div>

            <div className="md:col-span-3">
              <label className="ftn-label">Référence unique (TTN)</label>
              <input className="ftn-input" value={uniqueRef} onChange={(e) => setUniqueRef(e.target.value)} />
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
            <button
              type="button"
              className="px-4 py-2 rounded-2xl border border-slate-200 text-sm hover:bg-slate-50"
              onClick={addLine}
            >
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
                    <button
                      type="button"
                      className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
                      onClick={() => removeLine(i)}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totaux + Save */}
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
            {loading ? "Création..." : "Créer & Continuer"}
          </button>
        </div>
      </div>
    </div>
  );
}
