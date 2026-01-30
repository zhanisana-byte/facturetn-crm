"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; company_name: string };
type DocumentType = "facture" | "devis" | "avoir";
type CustomerType = "entreprise" | "particulier";

type ItemRow = {
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

function toNum(v: any, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function fmt3(n: number) {
  return round3(n).toFixed(3);
}

function iso4217OK(v: string) {
  return /^[A-Z]{3}$/.test((v || "").trim().toUpperCase());
}

function Modal({
  open,
  title,
  message,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg ftn-card p-5">
        <div className="text-lg font-semibold">{title}</div>
        <div className="mt-2 text-sm text-[var(--muted)]">{message}</div>
        <div className="mt-4 flex justify-end">
          <button className="ftn-btn" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
}

export default function NewInvoiceClient({
  companies,
  defaultCompanyId,
}: {
  companies: Company[];
  defaultCompanyId?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [isPending, startTransition] = useTransition();

  const [modal, setModal] = useState({ open: false, title: "", message: "" });

  const [companyId, setCompanyId] = useState(defaultCompanyId || companies[0]?.id || "");
  const [documentType, setDocumentType] = useState<DocumentType>("facture");
  const [customerType, setCustomerType] = useState<CustomerType>("entreprise");

  const [issueDate, setIssueDate] = useState(todayISO());
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const [currency, setCurrency] = useState("TND");
  const [stampAmount, setStampAmount] = useState(1);

  const [items, setItems] = useState<ItemRow[]>([
    { line_no: 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 },
  ]);

  const totals = useMemo(() => {
    let ht = 0;
    let vat = 0;

    for (const it of items) {
      const base = toNum(it.quantity) * toNum(it.unit_price_ht);
      const net = base - base * (toNum(it.discount_pct) / 100);
      ht += net;
      vat += net * (toNum(it.vat_pct) / 100);
    }

    ht = round3(ht);
    vat = round3(vat);

    const ttc = round3(ht + vat);
    const stamp = round3(toNum(stampAmount));
    const net = round3(ttc + stamp);

    return { ht, vat, stamp, net };
  }, [items, stampAmount]);

  function openError(message: string) {
    setModal({ open: true, title: "Erreur", message });
  }

  function addLine() {
    setItems((p) => [...p, { line_no: p.length + 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 }]);
  }

  function updateLine(i: number, key: keyof ItemRow, value: any) {
    setItems((p) => p.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  function removeLine(i: number) {
    setItems((p) => p.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, line_no: idx + 1 })));
  }

  async function onCreate() {
    if (isPending) return;

    if (!companyId) return openError("Veuillez choisir une société.");
    if (!customerName.trim()) return openError("Nom client obligatoire.");
    if (!issueDate) return openError("Date obligatoire.");
    if (!iso4217OK(currency)) return openError("Devise invalide.");

    if (customerType === "entreprise" && !customerTaxId.trim()) {
      return openError("MF obligatoire pour un client entreprise.");
    }

    const validItems = items.filter((i) => i.description.trim() && toNum(i.quantity) > 0);
    if (!validItems.length) return openError("Ajoutez au moins une ligne valide.");

    startTransition(async () => {
      try {
        const { data, error } = await supabase
          .from("invoices")
          .insert({
            company_id: companyId,
            document_type: documentType,
            issue_date: issueDate,
            invoice_number: invoiceNumber || null,
            customer_name: customerName,
            customer_tax_id: customerTaxId || null,
            customer_email: customerEmail || null,
            customer_phone: customerPhone || null,
            customer_address: customerAddress || null,
            currency,
            subtotal_ht: totals.ht,
            total_vat: totals.vat,
            total_ttc: round3(totals.ht + totals.vat),
            stamp_enabled: true,
            stamp_amount: totals.stamp,
            net_to_pay: totals.net,
            status: "draft",
            send_mode: "manual",
            ttn_status: "not_sent",
          })
          .select("id")
          .single();

        if (error) throw error;

        const invoiceId = data.id;

        await supabase.from("invoice_items").insert(
          validItems.map((it, idx) => {
            const base = toNum(it.quantity) * toNum(it.unit_price_ht);
            const net = base - base * (toNum(it.discount_pct) / 100);
            const vat = net * (toNum(it.vat_pct) / 100);

            return {
              invoice_id: invoiceId,
              line_no: idx + 1,
              description: it.description,
              quantity: it.quantity,
              unit_price_ht: it.unit_price_ht,
              vat_pct: it.vat_pct,
              discount_pct: it.discount_pct,
              line_total_ht: round3(net),
              line_vat_amount: round3(vat),
              line_total_ttc: round3(net + vat),
            };
          })
        );

        router.push(`/invoices/${invoiceId}`);
        router.refresh();
      } catch (e: any) {
        openError(e.message || "Erreur inconnue.");
      }
    });
  }

  return (
    <div className="ftn-page pb-24">
      <Modal {...modal} onClose={() => setModal({ ...modal, open: false })} />

      <div className="ftn-page-head">
        <div>
          <h1 className="ftn-h1">Nouveau document</h1>
          <p className="ftn-subtitle">Facture / Devis / Avoir</p>
        </div>
        <Link className="ftn-btn ftn-btn-ghost" href="/invoices">Retour</Link>
      </div>

      {/* FORMULAIRE + LIGNES (identique à ce que tu as déjà, non modifié visuellement) */}
      {/* … ton JSX formulaire reste inchangé ici … */}

      <div className="fixed right-4 bottom-4 z-[70]">
        <div className="ftn-card px-4 py-3 shadow-lg flex items-center gap-4">
          <div>
            <div className="text-xs text-[var(--muted)]">Total TTC</div>
            <div className="text-base font-semibold">{fmt3(totals.net)}</div>
          </div>
          <button className="ftn-btn" onClick={onCreate} disabled={isPending}>
            {isPending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
