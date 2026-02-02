import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";
import InvoiceActions from "./InvoiceActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export default async function InvoiceViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase.auth.getSession();
  const user = session.session?.user;
  if (!user) redirect("/login");

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (invErr || !invoice) redirect("/invoices");

  const companyId = s((invoice as any).company_id);
  const documentType = s((invoice as any).document_type ?? "facture").toLowerCase();
  const status = s((invoice as any).status ?? "draft");
  const ttnStatus = s((invoice as any).ttn_status ?? "not_sent");
  const ttnScheduledAt = (invoice as any).ttn_scheduled_at ? String((invoice as any).ttn_scheduled_at) : null;

  const validationRequired = Boolean((invoice as any).require_accountant_validation);
  const validatedAt = (invoice as any).accountant_validated_at ? String((invoice as any).accountant_validated_at) : null;

  const signatureRequired = Boolean((invoice as any).signature_provider && (invoice as any).signature_provider !== "none")
    ? true
    : Boolean((invoice as any).signature_required ?? false);

  const invoiceSigned =
    s((invoice as any).signature_status).toLowerCase() === "signed" ||
    Boolean((invoice as any).signed_xml_path) ||
    Boolean((invoice as any).signed_pdf_path);

  const signaturePending = s((invoice as any).signature_status).toLowerCase() === "pending";

  const signatureProvider = s((invoice as any).signature_provider ?? "none");
  const digigoTransactionId = s((invoice as any).digigo_transaction_id ?? "");
  const digigoOtpId = s((invoice as any).digigo_otp_id ?? "");
  const viewedBeforeSignatureAt = (invoice as any).viewed_before_signature_at
    ? String((invoice as any).viewed_before_signature_at)
    : null;

  const canSendTTN = true;
  const canValidate = true;
  const canSubmitForValidation = true;

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });

  const subtotal = Number((invoice as any).subtotal_ht ?? 0);
  const totalVat = Number((invoice as any).total_vat ?? (invoice as any).total_tva ?? 0);
  const totalTtc = Number((invoice as any).total_ttc ?? 0);
  const netToPay = Number((invoice as any).net_to_pay ?? 0);

  return (
    <AppShell title="Facture" subtitle={s((invoice as any).invoice_number) ? `N° ${s((invoice as any).invoice_number)}` : ""} accountType="entreprise">
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs">Paiement: {s((invoice as any).payment_status ?? "unpaid")}</span>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs">TTN: {ttnStatus}</span>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs">Période: {s((invoice as any).billing_period ?? "—")}</span>
            <span className="rounded-full bg-white/70 px-3 py-1 text-xs">Validation: {validatedAt ? "ok" : validationRequired ? "non" : "—"}</span>
          </div>

          <Link
            href="/invoices"
            className="rounded-full bg-white/70 px-4 py-2 text-sm hover:bg-white transition"
          >
            ← Retour factures
          </Link>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Lignes</h2>
            <div className="text-xs text-slate-500">{(items ?? []).length} ligne(s)</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-500">
                <tr className="border-b">
                  <th className="py-2 text-left w-10">#</th>
                  <th className="py-2 text-left">Description</th>
                  <th className="py-2 text-right w-24">Qté</th>
                  <th className="py-2 text-right w-28">PU HT</th>
                  <th className="py-2 text-right w-20">TVA%</th>
                  <th className="py-2 text-right w-28">Total HT</th>
                  <th className="py-2 text-right w-28">Total TTC</th>
                </tr>
              </thead>
              <tbody>
                {(items ?? []).map((it: any, idx: number) => (
                  <tr key={it.id} className="border-b">
                    <td className="py-2">{idx + 1}</td>
                    <td className="py-2">{s(it.description ?? it.label)}</td>
                    <td className="py-2 text-right">{Number(it.quantity ?? it.qty ?? 1).toFixed(2)}</td>
                    <td className="py-2 text-right">{Number(it.unit_price_ht ?? it.unit_price ?? it.price ?? 0).toFixed(3)}</td>
                    <td className="py-2 text-right">{Number(it.vat_pct ?? it.vat ?? 0)}</td>
                    <td className="py-2 text-right">{Number(it.line_total_ht ?? 0).toFixed(3)}</td>
                    <td className="py-2 text-right">{Number(it.line_total_ttc ?? 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Subtotal HT</div>
              <div className="text-lg font-semibold">{subtotal.toFixed(3)} TND</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">TVA</div>
              <div className="text-lg font-semibold">{totalVat.toFixed(3)} TND</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Total TTC</div>
              <div className="text-lg font-semibold">{totalTtc.toFixed(3)} TND</div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="text-xs text-slate-500">Net à payer</div>
              <div className="text-lg font-semibold">{netToPay.toFixed(3)} TND</div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-semibold">Actions</h2>
          <p className="text-sm text-slate-600 mt-1">Téléchargements disponibles après l’enregistrement.</p>

          <InvoiceActions
            invoiceId={String((invoice as any).id)}
            companyId={companyId}
            documentType={documentType}
            canSendTTN={canSendTTN}
            canValidate={canValidate}
            canSubmitForValidation={canSubmitForValidation}
            validationRequired={validationRequired}
            status={status}
            validatedAt={validatedAt}
            ttnStatus={ttnStatus}
            ttnScheduledAt={ttnScheduledAt}
            ttnSendMode={s((invoice as any).send_mode ?? "manual") === "api" ? "api" : "manual"}
            signatureProvider={signatureProvider}
            signatureRequired={signatureRequired}
            invoiceSigned={invoiceSigned}
            signaturePending={signaturePending}
            digigoTransactionId={digigoTransactionId}
            digigoOtpId={digigoOtpId}
            viewedBeforeSignatureAt={viewedBeforeSignatureAt}
          />
        </Card>
      </div>
    </AppShell>
  );
}
