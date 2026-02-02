import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapDbAccountType } from "@/app/types";
import InvoiceActions from "./InvoiceActions";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ id: string }> };

function Badge({ children }: { children: ReactNode }) {
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
  const { id  } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  const t = mapDbAccountType(profile?.account_type);
  
  if (t !== "profil") redirect("/switch");

  const [{ data: invoice, error: invErr }, { data: items }] = await Promise.all([
    supabase.from("invoices").select("*").eq("id", id).single(),
    supabase.from("invoice_items").select("*").eq("invoice_id", id).order("line_no", { ascending: true }),
  ]);

  if (invErr || !invoice) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold">Facture</h1>
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700 font-medium">Impossible de charger la facture.</p>
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

  const companyId = (invoice as any).company_id as string | undefined;

  const invoiceNumber = (invoice as any).invoice_number || "";
  const currency = (invoice as any).currency || "TND";

  const billingPeriod = (invoice as any).billing_period
    ? String((invoice as any).billing_period).slice(0, 7)
    : "—";

  const paymentStatus = (invoice as any).payment_status || "unpaid";
  const ttnStatus = (invoice as any).ttn_status || "not_sent";
  const ttnScheduledAt = (invoice as any).ttn_scheduled_at || null;

  const requireValidation = !!(invoice as any).require_accountant_validation;
  const validatedAt = (invoice as any).accountant_validated_at || null;
  const validatedBy = (invoice as any).accountant_validated_by || null;

  let canValidate = false;
  let canSubmitTTN = false;
  let canSubmitForValidation = false;

  if (companyId) {
    
    const [{ data: comp }, { data: mem }] = await Promise.all([
      supabase.from("companies").select("id,owner_user_id").eq("id", companyId).maybeSingle(),
      supabase
        .from("memberships")
        .select("role,is_active,can_create_invoices,can_validate_invoices,can_submit_ttn")
        .eq("company_id", companyId)
        .eq("user_id", auth.user.id)
        .maybeSingle(),
    ]);

    const isOwner = (comp as any)?.owner_user_id === auth.user.id;

    const isActive = !!mem?.is_active;
    const roleOwner = mem?.role === "owner";

    canSubmitForValidation = isOwner || (isActive && (roleOwner || mem?.can_create_invoices === true));
    canValidate = isOwner || (isActive && (roleOwner || mem?.can_validate_invoices === true));
    canSubmitTTN = isOwner || (isActive && (roleOwner || mem?.can_submit_ttn === true));
  }

  let validatedByEmail: string | null = null;
  if (validatedBy) {
    const { data: vb } = await supabase
      .from("app_users")
      .select("email,full_name")
      .eq("id", validatedBy)
      .maybeSingle();
    validatedByEmail = vb?.email ? String(vb.email) : null;
  }

  const canSendTTN = canSubmitTTN && (requireValidation ? !!validatedAt : true);

  let signatureProvider: string = "none";
  let signatureRequired = false;
  let invoiceSigned = false;
  let signaturePending = false;
  let digigoTransactionId: string | null = null;
  let digigoOtpId: string | null = null;
  let ttnSendMode: "api" | "manual" = "api";
  if (companyId) {
    const [{ data: cred }, { data: sig }] = await Promise.all([
      supabase
        .from("ttn_credentials")
        .select("signature_provider, require_signature, send_mode")
        .eq("company_id", companyId)
        .eq("environment", "production")
        .maybeSingle(),
      supabase
        .from("invoice_signatures")
        .select("invoice_id, provider, signed_xml, meta")
        .eq("invoice_id", id)
        .maybeSingle(),
    ]);

    const invSig = String((invoice as any)?.signature_provider ?? "");
    signatureProvider = invSig ? invSig : String((cred as any)?.signature_provider ?? "none");
    const isSignableDoc = ["facture","avoir"].includes(String((invoice as any)?.document_type ?? "facture"));
    signatureRequired = isSignableDoc && (Boolean((cred as any)?.require_signature) || signatureProvider !== "none");
    invoiceSigned = !!(sig as any)?.signed_xml;
    signaturePending = !!(sig as any)?.invoice_id && !invoiceSigned;
    ttnSendMode = (String((cred as any)?.send_mode || "api") as any) === "manual" ? "manual" : "api";
    if (String((sig as any)?.provider || "") === "digigo") {
      digigoTransactionId = (sig as any)?.meta?.transaction_id ? String((sig as any).meta.transaction_id) : null;
      digigoOtpId = (sig as any)?.meta?.otp_id ? String((sig as any).meta.otp_id) : null;
    }
  }

    const { data: viewProof } = await supabase
    .from("invoice_signature_views")
    .select("viewed_at")
    .eq("invoice_id", id)
    .eq("viewed_by", auth.user.id)
    .maybeSingle();

  const viewedBeforeSignatureAt = (viewProof as any)?.viewed_at ? String((viewProof as any).viewed_at) : null;

const subtotal = (invoice as any).subtotal_ht ?? 0;
  const totalVat = (invoice as any).total_vat ?? 0;
  const totalTtc = (invoice as any).total_ttc ?? (invoice as any).total ?? 0;
  const netToPay = (invoice as any).net_to_pay ?? totalTtc;

  return (
    <div className="p-6 max-w-5xl space-y-5">
      {}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Facture {invoiceNumber ? `• ${invoiceNumber}` : ""}</h1>

          <div className="mt-2 flex gap-2 flex-wrap">
            <Badge>Paiement: {paymentStatus}</Badge>
            <Badge>TTN: {ttnStatus}</Badge>
            <Badge>Période: {billingPeriod}</Badge>
            {requireValidation ? (
              validatedAt ? (
                <Badge>
                  Validée {validatedByEmail ? ` • ${validatedByEmail}` : ""}
                </Badge>
              ) : (
                <Badge>
                  {(invoice as any).status === "pending_validation"
                    ? "En attente validation"
                    : "Validation requise"}
                </Badge>
              )
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

      {}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Lignes</h2>
          <span className="text-xs text-slate-500">{items?.length ?? 0} ligne(s)</span>
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
            <div className="font-semibold">
              {money(subtotal)} {currency}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">TVA</div>
            <div className="font-semibold">
              {money(totalVat)} {currency}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Total TTC</div>
            <div className="font-semibold">
              {money(totalTtc)} {currency}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="text-xs text-slate-500">Net à payer</div>
            <div className="font-semibold">
              {money(netToPay)} {currency}
            </div>
          </div>
        </div>
      </div>

      {}
      <InvoiceActions
        invoiceId={String((invoice as any).id)}
        companyId={companyId} 
        documentType={String((invoice as any).document_type || "facture")}
        canSendTTN={canSendTTN}
        canValidate={canValidate}
        canSubmitForValidation={canSubmitForValidation}
        validationRequired={requireValidation}
        status={String((invoice as any).status || "draft")}
        validatedAt={validatedAt ? String(validatedAt) : null}
        ttnStatus={String(ttnStatus)}
        ttnScheduledAt={ttnScheduledAt ? String(ttnScheduledAt) : null}
        ttnSendMode={ttnSendMode}
        signatureProvider={signatureProvider}
        signatureRequired={signatureRequired}
        invoiceSigned={invoiceSigned}
        signaturePending={signaturePending}
        digigoTransactionId={digigoTransactionId}
        digigoOtpId={digigoOtpId}
        viewedBeforeSignatureAt={viewedBeforeSignatureAt}
      />
    </div>
  );
}