import AppShell from "@/app/components/AppShell";
import SignatureClient from "./SignatureClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InvoiceSignaturePage() {
  return (
    <AppShell title="Signature facture" subtitle="Consultation & signature" accountType="entreprise">
      <SignatureClient />
    </AppShell>
  );
}
