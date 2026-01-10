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
  const urlMode = (sp.get("mode") || "") as "normal" | "permanente" | "";

  const [companies, setCompanies] = useState<Company[]>([]);
  const [invoiceMode, setInvoiceMode] = useState<"normal" | "permanente" | null>(
    urlMode === "normal" || urlMode === "permanente" ? urlMode : null
  );
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
  const [codeClient, setCodeClient] = useState("");

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
        if (!urlCompany && data.length === 1) setCompanyId((data[0] as any).id);
      }
      if (urlCompany) setCompanyId(urlCompany);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      if (!companyId) return;

      const { data: settings, error } = await supabase
        .from("company_ttn_settings")
        .select("vat_default, stamp_enabled_default, stamp_amount_default")
        .eq("company_id", companyId)
        .maybeSingle();

      if (error || !settings) return;

      if (typeof settings.vat_default === "number") {
        setLines((prev) =>
          prev.map((l) =>
            (l.description || "").trim() === "" ? { ...l, vat: settings.vat_default } : l
          )
        );
      }

      if (typeof settings.stamp_enabled_default === "boolean") {
        setStampEnabled(settings.stamp_enabled_default);
      }
      if (typeof settings.stamp_amount_default === "number") {
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
      } catch {}
    }

    router.push(`/invoices/${invoiceId}`);
  }

  function goMode(mode: "normal" | "permanente") {
    setInvoiceMode(mode);
    const params = new URLSearchParams(sp.toString());
    params.set("mode", mode);
    router.replace(`/invoices/new?${params.toString()}`);
  }

  // =========================
  // UI: étape 1 (choix mode)
  // =========================
  if (!invoiceMode) {
    return (
      <div className="ftn-inv-wrap">
        <div className="ftn-inv-card">
          <div className="ftn-inv-head">
            <div>
              <div className="ftn-inv-h">Nouvelle facture TTN</div>
              <div className="ftn-inv-sub">Choisissez le mode avant de remplir les champs de la facture TTN.</div>
            </div>
            <span className="ftn-badge tone-info">Étape 1 / 2</span>
          </div>

          <div className="ftn-mode-grid2">
            <button className="ftn-mode-pro ftn-mode-pro--normal" onClick={() => goMode("normal")} type="button">
              <div className="ftn-mode-top">
                <span className="ftn-mode-dot ftn-dot-orange" />
                <div className="ftn-mode-txt">
                  <div className="ftn-mode-title">Mode Normal</div>
                  <div className="ftn-mode-desc">Facture TTN classique · création immédiate</div>
                </div>
                <span className="ftn-mode-radio" />
              </div>

              <div className="ftn-mode-pills">
                <span className="ftn-pill">PDF</span>
                <span className="ftn-pill">XML</span>
                <span className="ftn-pill">Numérotation</span>
                <span className="ftn-pill">Prêt TTN</span>
              </div>

              <div className="ftn-mode-foot">
                <button className="ftn-btn" type="button" onClick={() => goMode("normal")}>
                  Continuer en Normal
                </button>
              </div>
            </button>

            <button className="ftn-mode-pro ftn-mode-pro--perm" onClick={() => goMode("permanente")} type="button">
              <div className="ftn-mode-top">
                <span className="ftn-mode-dot ftn-dot-blue" />
                <div className="ftn-mode-txt">
                  <div className="ftn-mode-title">Mode Permanente</div>
                  <div className="ftn-mode-desc">Facture TTN mensuelle · modèle récurrent</div>
                </div>
                <span className="ftn-mode-radio" />
              </div>

              <div className="ftn-mode-pills">
                <span className="ftn-pill">Récurrent</span>
                <span className="ftn-pill">Mensuel</span>
                <span className="ftn-pill">Auto-génération</span>
                <span className="ftn-pill">TTN</span>
              </div>

              <div className="ftn-mode-foot">
                <button className="ftn-btn-ghost" type="button" onClick={() => goMode("permanente")}>
                  Configurer Permanente
                </button>
              </div>
            </button>
          </div>

          <div className="ftn-muted" style={{ marginTop: 10 }}>
            Astuce : commencez en <b>Normal</b>, puis activez <b>Permanente</b> après validation du module récurrent.
          </div>
        </div>
      </div>
    );
  }

  // =========================
  // UI: étape 2 (formulaire)
  // =========================
  return (
    <div className="ftn-inv-wrap">
      <div className="ftn-form-shell">
        <div className="ftn-form-head">
          <div>
            <div className="ftn-form-title">
              Facture TTN — Mode {invoiceMode === "permanente" ? "Permanente" : "Normal"}
            </div>
            <div className="ftn-form-sub">
              Remplissez la facture (puis export PDF/XML). Les champs restent inchangés.
            </div>
          </div>

          <button type="button" className="ftn-btn-ghost" onClick={() => setInvoiceMode(null)}>
            ← Changer le mode
          </button>
        </div>

        {/* SECTION: TTN */}
        <div className="ftn-block">
          <div className="ftn-block-head">
            <div>
              <div className="ftn-block-title">Données TTN (copie conforme)</div>
              <div className="ftn-block-sub">Type, période, référence unique, échéance…</div>
            </div>

            <div className="ftn-block-actions">
              <button type="button" className="ftn-btn-ghost ftn-btn-sm" onClick={() => setUniqueRef(genRef())}>
                Regénérer référence
              </button>
              <span className="ftn-badge tone-info">Étape 2 / 2</span>
            </div>
          </div>

          <div className="ftn-row ftn-row-3">
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

            <div className="ftn-col-span-2">
              <label className="ftn-label">Référence unique (TTN)</label>
              <input className="ftn-input" value={uniqueRef} onChange={(e) => setUniqueRef(e.target.value)} />
            </div>

            <div>
              <label className="ftn-label">Code client (optionnel)</label>
              <input className="ftn-input" value={codeClient} onChange={(e) => setCodeClient(e.target.value)} />
            </div>
          </div>

          {invoiceMode === "permanente" && (
            <div className="ftn-callout" style={{ marginTop: 10 }}>
              <div className="ftn-callout-title">Récurrence mensuelle</div>
              <div className="ftn-row ftn-row-3" style={{ marginTop: 8 }}>
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
                <div className="ftn-muted" style={{ alignSelf: "end" }}>
                  Modèle mensuel (auto-génération activée après SQL/cron).
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SECTION: CLIENT */}
        <div className="ftn-block">
          <div className="ftn-block-head">
            <div>
              <div className="ftn-block-title">Client</div>
              <div className="ftn-block-sub">Informations du destinataire</div>
            </div>
          </div>

          <div className="ftn-row ftn-row-2">
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
            <div className="ftn-col-span-2">
              <label className="ftn-label">Adresse</label>
              <input className="ftn-input" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </div>
          </div>
        </div>

        {/* SECTION: LIGNES */}
        <div className="ftn-block">
          <div className="ftn-block-head">
            <div>
              <div className="ftn-block-title">Lignes</div>
              <div className="ftn-block-sub">Produits / services / TVA / remise</div>
            </div>

            <button type="button" className="ftn-btn-ghost ftn-btn-sm" onClick={addLine}>
              + Ajouter ligne
            </button>
          </div>

          <div className="ftn-lines">
            {lines.map((l, i) => (
              <div key={i} className="ftn-line">
                <div className="ftn-line-grid">
                  <div className="ftn-line-desc">
                    <label className="ftn-label">Désignation</label>
                    <input className="ftn-input" value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} />
                  </div>

                  <div>
                    <label className="ftn-label">Qté</label>
                    <input className="ftn-input" type="number" value={l.qty} onChange={(e) => updateLine(i, { qty: Number(e.target.value) })} />
                  </div>

                  <div>
                    <label className="ftn-label">PU HT</label>
                    <input className="ftn-input" type="number" value={l.price} onChange={(e) => updateLine(i, { price: Number(e.target.value) })} />
                  </div>

                  <div>
                    <label className="ftn-label">TVA%</label>
                    <input className="ftn-input" type="number" value={l.vat} onChange={(e) => updateLine(i, { vat: Number(e.target.value) })} />
                  </div>

                  <div>
                    <label className="ftn-label">Rem%</label>
                    <input className="ftn-input" type="number" value={l.discount} onChange={(e) => updateLine(i, { discount: Number(e.target.value) })} />
                  </div>

                  <div className="ftn-line-x">
                    {lines.length > 1 && (
                      <button type="button" className="ftn-x" onClick={() => removeLine(i)} title="Supprimer ligne">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION: TOTAUX */}
        <div className="ftn-block">
          <div className="ftn-block-head">
            <div>
              <div className="ftn-block-title">Totaux</div>
              <div className="ftn-block-sub">HT · TVA · Timbre · Net à payer</div>
            </div>
          </div>

          <div className="ftn-kpi">
            <div className="ftn-kpi-card">
              <div className="ftn-kpi-title">Total HT</div>
              <div className="ftn-kpi-value">{totals.subtotal.toFixed(3)} TND</div>
            </div>
            <div className="ftn-kpi-card">
              <div className="ftn-kpi-title">TVA</div>
              <div className="ftn-kpi-value">{totals.totalVat.toFixed(3)} TND</div>
            </div>
            <div className="ftn-kpi-card">
              <div className="ftn-kpi-title">Timbre</div>
              <div className="ftn-kpi-value">{(stampEnabled ? (Number(stampAmount) || 0) : 0).toFixed(3)} TND</div>
            </div>
            <div className="ftn-kpi-card ftn-kpi-card--strong">
              <div className="ftn-kpi-title">Net à payer</div>
              <div className="ftn-kpi-value">{totals.totalTtc.toFixed(3)} TND</div>
            </div>
          </div>

          <div className="ftn-row ftn-row-3" style={{ marginTop: 10 }}>
            <div className="ftn-toggle">
              <input
                id="stamp"
                type="checkbox"
                className="h-4 w-4"
                checked={stampEnabled}
                onChange={(e) => setStampEnabled(e.target.checked)}
              />
              <label htmlFor="stamp" className="ftn-toggle-label">
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

            <div className="ftn-col-span-3">
              <label className="ftn-label">Notes (optionnel)</label>
              <input className="ftn-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="ftn-form-footer">
            <button className="ftn-btn" disabled={loading} onClick={save}>
              {loading ? "Création..." : "Créer la facture"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
