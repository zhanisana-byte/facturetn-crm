import AppShell from "@/app/components/AppShell";
import InvoiceSignatureClient from "./InvoiceSignatureClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InvoiceSignaturePage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  return (
    <AppShell title="Signature facture" subtitle="Signature DigiGo" accountType="entreprise">
      <InvoiceSignatureClient invoiceId={id} />
    </AppShell>
  );
}
