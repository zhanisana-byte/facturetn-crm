import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import InvoiceSignatureClient from "./InvoiceSignatureClient";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InvoiceSignaturePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ back?: string }>;
}) {
  const supabase = await createClient();
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const { id } = await params;
  const sp = (await searchParams) || {};
  const backUrl = typeof sp.back === "string" && sp.back.trim() ? sp.back : `/invoices/${id}`;

  return (
    <AppShell title="Signature facture" subtitle="Signature DigiGo" accountType="profil">
      <div className="mx-auto w-full max-w-3xl p-6">
        <InvoiceSignatureClient invoiceId={id} backUrl={backUrl} />
      </div>
    </AppShell>
  );
}
