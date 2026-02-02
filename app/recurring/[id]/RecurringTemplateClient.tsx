"use client";

import { useMemo, useState, ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Template = {
  id: string;
  company_id: string;
  title: string;
  cadence: string;
  day_of_month: number | null;
  currency: string;
  is_active: boolean;
};

type Item = {
  id: string;
  template_id: string;
  position: number;
  description: string;
  qty: number;
  price: number;
  vat: number;
  discount: number;
};

type GeneratedInvoice = {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  billing_period: string | null;
  total_ttc: number | null;
  currency: string | null;
  status: string | null;
  ttn_status: string | null;
};

function money(v: number | null, c = "TND") {
  const n = Number(v ?? 0);
  return `${n.toFixed(3)} ${c}`;
}

function canDelete(ttn_status: string | null) {
  const s = (ttn_status ?? "").toLowerCase();
  
  return s.includes("not") || s === "" || s === "not_sent" || s === "draft";
}

export default function RecurringTemplateClient({
  template,
  items,
  company,
  generatedInvoices,
}: {
  template: Template;
  items: Item[];
  company: { id: string; company_name: string | null } | null;
  generatedInvoices: GeneratedInvoice[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newDesc, setNewDesc] = useState("");
  const [newQty, setNewQty] = useState("1");
  const [newPrice, setNewPrice] = useState("0");
  const [newVat, setNewVat] = useState("19");
  const [newDiscount, setNewDiscount] = useState("0");

  const today = new Date();
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [period, setPeriod] = useState<string>(ym);

  async function requireAuth() {
    if (!supabase) {
      setErr("Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY).");
      return false;
    }
    const { data: s } = await supabase.auth.getSession();
    if (!s.session?.user) {
      router.push("/login");
      return false;
    }
    return true;
  }

  async function addItem() {
    setErr(null);
    if (!(await requireAuth())) return;
    if (!newDesc.trim()) {
      setErr("Désignation requise.");
      return;
    }
    setBusy(true);
    const r = await fetch(`/api/recurring/${template.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: newDesc.trim(),
        qty: Number(newQty || 1),
        price: Number(newPrice || 0),
        vat: Number(newVat || 0),
        discount: Number(newDiscount || 0),
      }),
    }).catch(() => null);

    if (!r || !r.ok) {
      const j = await r?.json().catch(() => ({} as any));
      setErr(j?.error || "Erreur ajout ligne.");
      setBusy(false);
      return;
    }
    setNewDesc("");
    setNewQty("1");
    setNewPrice("0");
    setNewVat("19");
    setNewDiscount("0");
    router.refresh();
    setBusy(false);
  }

  async function deleteItem(itemId: string) {
    setErr(null);
    if (!(await requireAuth())) return;
    setBusy(true);
    const r = await fetch(`/api/recurring/items/${itemId}`, { method: "DELETE" }).catch(() => null);
    if (!r || !r.ok) {
      const j = await r?.json().catch(() => ({} as any));
      setErr(j?.error || "Erreur suppression ligne.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  async function generate() {
    setErr(null);
    if (!(await requireAuth())) return;
    if (!/^\d{4}-\d{2}$/.test(period)) {
      setErr("Période invalide. Format attendu: YYYY-MM");
      return;
    }
    setBusy(true);
    const r = await fetch(`/api/recurring/${template.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billing_period: period }),
    }).catch(() => null);

    if (!r || !r.ok) {
      const j = await r?.json().catch(() => ({} as any));
      setErr(j?.error || j?.message || "Erreur génération facture.");
      setBusy(false);
      return;
    }
    const j = await r.json().catch(() => null);
    const invoiceId = String(j?.invoice_id || "");
    if (invoiceId) {
      router.push(`/invoices/${invoiceId}`);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  async function deleteInvoice(invoiceId: string) {
    const ok = confirm("Supprimer cette facture générée ?");
    if (!ok) return;
    setErr(null);
    setBusy(true);

    const r = await fetch(`/invoices/${invoiceId}/delete`, { method: "POST" }).catch(() => null);
    if (!r || !r.ok) {
      const j = await r?.json().catch(() => ({} as any));
      setErr(j?.error || "Erreur suppression facture.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      <div className="ftn-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{template.title}</div>
            <div className="text-sm text-slate-600 mt-1">
              Société: <span className="font-medium">{company?.company_name ?? "—"}</span> · Devise: {template.currency}
            </div>
          </div>
          <div className="flex gap-2">
            <Link className="ftn-btn ftn-btn-ghost" href="/recurring">Retour</Link>
            <Link className="ftn-btn ftn-btn-ghost" href="/invoices">Factures</Link>
          </div>
        </div>

        {err ? <div className="ftn-alert mt-4">{err}</div> : null}

        {}
        <div className="mt-4 grid gap-3">
          <div className="text-sm font-semibold">Lignes (désignation obligatoire)</div>

          {!items.length ? (
            <div className="text-sm text-slate-600">Aucune ligne. Ajoute au moins 1 ligne.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-600 border-b">
                    <th className="py-2 pr-3">Désignation</th>
                    <th className="py-2 pr-3">Qté</th>
                    <th className="py-2 pr-3">PU</th>
                    <th className="py-2 pr-3">TVA</th>
                    <th className="py-2 pr-3">Remise</th>
                    <th className="py-2 pr-0"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-3">{it.description}</td>
                      <td className="py-2 pr-3">{Number(it.qty ?? 0)}</td>
                      <td className="py-2 pr-3">{Number(it.price ?? 0).toFixed(3)}</td>
                      <td className="py-2 pr-3">{Number(it.vat ?? 0)}%</td>
                      <td className="py-2 pr-3">{Number(it.discount ?? 0)}%</td>
                      <td className="py-2 pr-0 text-right">
                        <button
                          type="button"
                          className="ftn-btn ftn-btn-ghost"
                          onClick={() => deleteItem(it.id)}
                          disabled={busy}
                        >
                          Supprimer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">
            <input
              className="ftn-input lg:col-span-5"
              placeholder="Désignation"
              value={newDesc}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNewDesc(e.target.value)}
            />
            <input className="ftn-input lg:col-span-1" placeholder="Qté" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
            <input className="ftn-input lg:col-span-2" placeholder="PU" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            <input className="ftn-input lg:col-span-2" placeholder="TVA" value={newVat} onChange={(e) => setNewVat(e.target.value)} />
            <input className="ftn-input lg:col-span-1" placeholder="Remise" value={newDiscount} onChange={(e) => setNewDiscount(e.target.value)} />
            <button className="ftn-btn lg:col-span-1" type="button" onClick={addItem} disabled={busy}>+</button>
          </div>

          {}
          <div className="mt-4 rounded-2xl border border-slate-200/60 bg-white/50 p-4">
            <div className="text-sm font-semibold">Générer la facture du mois</div>
            <div className="mt-2 flex flex-wrap gap-2 items-center">
              <input
                className="ftn-input w-[140px]"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="YYYY-MM"
              />
              <button className="ftn-btn" type="button" onClick={generate} disabled={busy}>
                Générer
              </button>
              <span className="text-xs text-slate-500">
                La facture créée aura invoice_mode=permanente + period_from/period_to + billing_period.
              </span>
            </div>
          </div>

          {}
          <div className="mt-4">
            <div className="text-sm font-semibold">Factures générées</div>
            {!generatedInvoices?.length ? (
              <div className="text-sm text-slate-600 mt-2">Aucune facture générée pour cette facture permanente.</div>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600 border-b">
                      <th className="py-2 pr-3">Période</th>
                      <th className="py-2 pr-3">N°</th>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Total</th>
                      <th className="py-2 pr-3">Statut</th>
                      <th className="py-2 pr-3">TTN</th>
                      <th className="py-2 pr-0"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-3">{inv.billing_period ?? "—"}</td>
                        <td className="py-2 pr-3">{inv.invoice_number ?? "—"}</td>
                        <td className="py-2 pr-3">{inv.issue_date ?? "—"}</td>
                        <td className="py-2 pr-3">{money(inv.total_ttc, inv.currency ?? "TND")}</td>
                        <td className="py-2 pr-3">{inv.status ?? "—"}</td>
                        <td className="py-2 pr-3">{inv.ttn_status ?? "—"}</td>
                        <td className="py-2 pr-0 text-right flex gap-2 justify-end">
                          <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${inv.id}`}>
                            Ouvrir
                          </Link>
                          <button
                            className="ftn-btn ftn-btn-ghost"
                            type="button"
                            disabled={busy || !canDelete(inv.ttn_status)}
                            onClick={() => deleteInvoice(inv.id)}
                            title={!canDelete(inv.ttn_status) ? "Suppression possible uniquement si non envoyée" : ""}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
