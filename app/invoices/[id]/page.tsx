import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";
import InvoiceActions from "./InvoiceActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

export default async function InvoicePage(ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) redirect("/login");

  const { id } = await ctx.params;

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();

  if (!invoice) {
    redirect("/invoices");
  }

  const requireAccountantValidation = Boolean((invoice as any).require_accountant_validation);
  const validatedAt = (invoice as any).accountant_validated_at ? String((invoice as any).accountant_validated_at) : null;

  const signatureProvider = s((invoice as any).signature_provider) || "digigo";
  const signatureRequired = signatureProvider !== "none";

  const invoiceSigned =
    s((invoice as any).signature_status).toLowerCase() === "signed" ||
    Boolean((invoice as any).signed_xml_path) ||
    Boolean((invoice as any).signed_pdf_path);

  const signaturePending = s((invoice as any).ttn_status).toLowerCase() === "pending_signature";
  const ttnStatus = s((invoice as any).ttn_status || "not_sent");

  const isLocked = invoiceSigned || signaturePending || (ttnStatus !== "not_sent" && ttnStatus !== "pending_signature");

  return (
    <AppShell title="Facture" subtitle="Résumé" accountType="entreprise">
      <div className="grid gap-4 md:grid-cols-12">
        <div className="md:col-span-8 space-y-4">
          <Card className="p-6 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">
                  {s((invoice as any).document_type || "facture").toUpperCase()}{" "}
                  {s((invoice as any).invoice_number) ? `#${s((invoice as any).invoice_number)}` : ""}
                </div>
                <div className="text-sm text-slate-600">Date: {s((invoice as any).issue_date)}</div>
              </div>

              <div className="flex gap-2">
                {!isLocked && (
                  <Link className="ftn-btn ftn-btn-ghost" href={`/invoices/${id}/edit`}>
                    Modifier
                  </Link>
                )}
                <Link className="ftn-btn ftn-btn-ghost" href="/invoices">
                  Retour
                </Link>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2 text-sm">
              <div>
                <div className="text-slate-600">Client</div>
                <div className="font-medium">{s((invoice as any).customer_name)}</div>
                {s((invoice as any).customer_tax_id) ? (
                  <div className="text-slate-600">MF: {s((invoice as any).customer_tax_id)}</div>
                ) : null}
              </div>

              <div>
                <div className="text-slate-600">Totaux</div>
                <div className="font-medium">HT: {Number((invoice as any).subtotal_ht || 0).toFixed(3)}</div>
                <div className="font-medium">TVA: {Number((invoice as any).total_vat || 0).toFixed(3)}</div>
                <div className="font-medium">Timbre: {Number((invoice as any).stamp_amount || 0).toFixed(3)}</div>
                <div className="font-semibold">Net: {Number((invoice as any).net_to_pay || 0).toFixed(3)}</div>
              </div>
            </div>
          </Card>
        </div>

        <div className="md:col-span-4 space-y-4">
          <Card className="p-6 space-y-3">
            <div className="text-lg font-semibold">Statut</div>

            <div className="text-sm">
              <div className="text-slate-600">Signature</div>
              <div className="font-medium">{invoiceSigned ? "Signée" : signatureRequired ? "Non signée" : "Non requise"}</div>
            </div>

            {requireAccountantValidation && (
              <div className="text-sm">
                <div className="text-slate-600">Validation comptable</div>
                <div className="font-medium">{validatedAt ? "Validée" : "En attente"}</div>
              </div>
            )}

            <div className="text-sm">
              <div className="text-slate-600">TTN</div>
              <div className="font-medium">{ttnStatus}</div>
            </div>
          </Card>

          <InvoiceActions invoiceId={String((invoice as any).id)} invoiceSigned={invoiceSigned} signatureRequired={signatureRequired} />
        </div>
      </div>
    </AppShell>
  );
}
