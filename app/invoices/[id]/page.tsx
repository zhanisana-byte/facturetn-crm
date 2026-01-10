import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceActions from "./InvoiceActions";

type PageProps = { params: Promise<{ id: string }> };
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1 rounded-full text-xs border border-slate-200 bg-white">
      {children}
    </span>
  );
}

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // ✅ SAFE : ne plante pas si colonnes manquantes
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (invErr || !invoice) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold">Facture</h1>
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700 font-medium">
            Impossible de charger la facture.
          </p>
          <p className="text-xs text-red-700 mt-1">
            {invErr?.message || "Facture introuvable ou accès refusé (RLS)."}
          </p>
        </div>
        <div className="mt-4">
          <Link
            href="/invoices"
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
          >
            ← Retour
          </Link>
        </div>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoice.id)
    .order("line_no", { ascending: true });

  const companyId = invoice.company_id as string | undefined;

  const invoiceNumber = invoice.invoice_number || "";
  const currency = invoice.currency || "TND";

  const billingPeriod = invoice.billing_period
    ? String(invoice.billing_period).slice(0, 7)
    : "—";

  const paymentStatus = invoice.payment_status || "unpaid";
  const ttnStatus = invoice.ttn_status || "not_sent";

  const requireValidation = !!invoice.require_accountant_validation;
  const validatedAt = invoice.accountant_validated_at || null;

  // ✅ règle business : TTN seulement après validation
  const canSendTTN = !!validatedAt;

  const subtotal = invoice.subtotal_ht ?? 0;
  const totalVat = invoice.total_vat ?? 0;
  const totalTtc = invoice.total_ttc ?? invoice.total ?? 0;
  const netToPay = invoice.net_to_pay ?? totalTtc;

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">
            Facture {invoiceNumber ? `• ${invoiceNumber}` : ""}
          </h1>

          <div className="mt-2 flex gap-2 flex-wrap">
            <Badge>Paiement: {paymentStatus}</Badge>
            <Badge>TTN: {ttnStatus}</Badge>
            <Badge>Période: {billingPeriod}</Badge>
            {requireValidation ? (
              validatedAt ? <Badge>Validée ✅</Badge> : <Badge>Validation requise</Badge>
            ) : (
              <Badge>Validation: non</Badge>
            )}
          </div>
        </div>

        <Link
          href={companyId ? `/invoices?company=${companyId}` : "/invoices"}
          className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
        >
          ← Retour factures
        </Link>
      </div>

      {/* Lignes */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Lignes</h2>
          <span className="text-xs text-slate-500">
            {items?.length ?? 0} ligne(s)
          </span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Description</th>
                <th className="text-right py-2">Qté</th>
                <th className="text-right py-2">PU HT</th>
                <th className="text-right py-2">TVA%</th>
                <th className="text-right py-2">Total HT</th>
                <th className="text-right py-2">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((it: any) => (
                <tr key={it.id} className="border-b last:border-b-0">
                  <td className="py-2">{it.line_no ?? ""}</td>
                  <td className="py-2">{it.description ?? ""}</td>
                  <td className="py-2 text-right">{Number(it.quantity ?? 0).toFixed(2)}</td>
                  <td className="py-2 text-right">{money(it.unit_price_ht)}</td>
                  <td className="py-2 text-right">{Number(it.vat_pct ?? 0).toFixed(0)}</td>
                  <td className="py-2 text-right">{money(it.line_total_ht)}</td>
                  <td className="py-2 text-right">{money(it.line_total_ttc)}</td>
                </tr>
              ))}
              {(!items || items.length === 0) && (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>
                    Aucune ligne trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Subtotal HT</div>
            <div className="font-semibold">{money(subtotal)} {currency}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">TVA</div>
            <div className="font-semibold">{money(totalVat)} {currency}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Total TTC</div>
            <div className="font-semibold">{money(totalTtc)} {currency}</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Net à payer</div>
            <div className="font-semibold">{money(netToPay)} {currency}</div>
          </div>
        </div>
      </div>

      {/* ✅ Actions (Client Component) */}
      <InvoiceActions
        invoiceId={String(invoice.id)}
        canSendTTN={canSendTTN}
        needsValidation={requireValidation && !validatedAt}
      />
    </div>
  );
}
