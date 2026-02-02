"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";
import { calcInvoiceTotals } from "@/lib/invoices/calcTotals";

type ItemRow = {
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
};

const DOCUMENT_TYPES = [
  { value: "facture", label: "Facture" },
  { value: "devis", label: "Devis" },
  { value: "avoir", label: "Avoir" },
] as const;

function s(v: any) {
  return String(v ?? "").trim();
}

function isValidDateISO(d: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export default function NewInvoiceClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);

  const [documentType, setDocumentType] = useState<(typeof DOCUMENT_TYPES)[number]["value"]>("facture");

  const today = new Date();
  const y = String(today.getFullYear());
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");

  const [issueDate, setIssueDate] = useState(`${y}-${m}-${d}`);
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const [currency, setCurrency] = useState("TND");

  const [items, setItems] = useState<ItemRow[]>([
    { description: "", quantity: 1, unit_price: 0, vat_rate: 19 },
  ]);

  const totals = useMemo(() => {
    return calcInvoiceTotals(items, { stampEnabled: true });
  }, [items]);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("id,name")
        .order("created_at", { ascending: false });

      if (!error && data) {
        const list = (data as any[]).map((c) => ({ id: String(c.id), name: String(c.name || "") }));
        setCompanies(list);
        if (!companyId && list[0]?.id) setCompanyId(list[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateItem(index: number, patch: Partial<ItemRow>) {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function addItem() {
    setItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0, vat_rate: 19 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function validate() {
    const cid = s(companyId);
    if (!cid) return "Société requise";
    if (!isValidDateISO(issueDate)) return "Date invalide";
    if (!s(customerName)) return "Nom client requis";
    if (!s(currency)) return "Devise requise";
    if (!items.length) return "Lignes facture requises";

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!s(it.description)) return `Description requise (ligne ${i + 1})`;
      if (!(Number(it.quantity) > 0)) return `Quantité invalide (ligne ${i + 1})`;
      if (!(Number(it.unit_price) >= 0)) return `Prix unitaire invalide (ligne ${i + 1})`;
      if (!(Number(it.vat_rate) >= 0)) return `TVA invalide (ligne ${i + 1})`;
    }

    return null;
  }

  function onCreate() {
    setError(null);

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    startTransition(async () => {
      try {
        const payload: any = {
          company_id: companyId,
          document_type: documentType,
          invoice_mode: "normal",
          issue_date: issueDate,
          invoice_number: invoiceNumber.trim() || null,

          customer_name: customerName.trim(),
          customer_tax_id: customerTaxId.trim() || null,
          customer_email: customerEmail.trim() || null,
          customer_phone: customerPhone.trim() || null,
          customer_address: customerAddress.trim() || null,

          currency: currency.trim().toUpperCase(),

          subtotal_ht: totals.subtotal_ht,
          total_vat: totals.total_vat,
          total_ttc: totals.total_ttc,

          stamp_enabled: true,
          stamp_amount: totals.stamp_amount,
          net_to_pay: totals.net_to_pay,

          signature_provider: "digigo",
          signature_required: true,
          signature_status: "not_signed",

          send_mode: "manual",
          ttn_status: "not_sent",
          status: "draft",
        };

        const { data, error } = await supabase.from("invoices").insert(payload).select("id").single();
        if (error) throw new Error(error.message);

        const invoiceId = String((data as any)?.id);
        if (!invoiceId) throw new Error("ID facture manquant.");

        const cleanItems = items.map((it) => ({
          invoice_id: invoiceId,
          description: s(it.description),
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          vat_rate: Number(it.vat_rate),
          line_total_ht: Number(it.quantity) * Number(it.unit_price),
        }));

        const { error: itemsErr } = await supabase.from("invoice_items").insert(cleanItems);
        if (itemsErr) throw new Error(itemsErr.message);

        router.push(`/invoices/${invoiceId}`);
        router.refresh();
      } catch (e: any) {
        setError(s(e?.message) || "Erreur création facture");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium mb-1">Société</div>
            <select className="ftn-input w-full" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Choisir...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Type</div>
            <select
              className="ftn-input w-full"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as any)}
            >
              {DOCUMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Date</div>
            <input className="ftn-input w-full" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Numéro (optionnel)</div>
            <input
              className="ftn-input w-full"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="Auto si vide"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-sm font-medium mb-1">Client</div>
            <input
              className="ftn-input w-full"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nom / Raison sociale"
            />
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Matricule fiscal (optionnel)</div>
            <input
              className="ftn-input w-full"
              value={customerTaxId}
              onChange={(e) => setCustomerTaxId(e.target.value)}
              placeholder="MF"
            />
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Devise</div>
            <input className="ftn-input w-full" value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Email (optionnel)</div>
            <input
              className="ftn-input w-full"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>

          <div>
            <div className="text-sm font-medium mb-1">Téléphone (optionnel)</div>
            <input
              className="ftn-input w-full"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-sm font-medium mb-1">Adresse (optionnel)</div>
            <input
              className="ftn-input w-full"
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="text-lg font-semibold">Lignes</div>

        <div className="space-y-3">
          {items.map((it, idx) => (
            <div key={idx} className="grid gap-3 md:grid-cols-12">
              <div className="md:col-span-5">
                <div className="text-xs text-slate-600 mb-1">Description</div>
                <input
                  className="ftn-input w-full"
                  value={it.description}
                  onChange={(e) => updateItem(idx, { description: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-slate-600 mb-1">Quantité</div>
                <input
                  className="ftn-input w-full"
                  type="number"
                  value={it.quantity}
                  onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-slate-600 mb-1">PU</div>
                <input
                  className="ftn-input w-full"
                  type="number"
                  value={it.unit_price}
                  onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) })}
                />
              </div>

              <div className="md:col-span-2">
                <div className="text-xs text-slate-600 mb-1">TVA %</div>
                <input
                  className="ftn-input w-full"
                  type="number"
                  value={it.vat_rate}
                  onChange={(e) => updateItem(idx, { vat_rate: Number(e.target.value) })}
                />
              </div>

              <div className="md:col-span-1 flex items-end">
                <button
                  className="ftn-btn ftn-btn-ghost w-full"
                  onClick={() => removeItem(idx)}
                  disabled={items.length <= 1}
                >
                  Suppr
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="ftn-btn ftn-btn-ghost" onClick={addItem}>
            Ajouter ligne
          </button>
        </div>

        <div className="border-t pt-4 grid gap-2 md:grid-cols-4 text-sm">
          <div>
            <div className="text-slate-600">HT</div>
            <div className="font-semibold">{totals.subtotal_ht.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-slate-600">TVA</div>
            <div className="font-semibold">{totals.total_vat.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-slate-600">Timbre</div>
            <div className="font-semibold">{totals.stamp_amount.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-slate-600">Net à payer</div>
            <div className="font-semibold">{totals.net_to_pay.toFixed(3)}</div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        )}

        <div className="flex gap-2 justify-end">
          <button className="ftn-btn" onClick={onCreate} disabled={loading}>
            {loading ? "Création..." : "Créer la facture"}
          </button>
        </div>
      </Card>
    </div>
  );
}
