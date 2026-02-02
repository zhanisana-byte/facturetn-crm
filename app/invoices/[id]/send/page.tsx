import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { mapDbAccountType } from "@/app/types";
import SendInvoiceEmailClient from "./SendInvoiceEmailClient";

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export default async function SendInvoiceEmailPage({ params }: PageProps) {
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

  return (
    <AppShell accountType="profil" title="Envoyer facture" subtitle="Envoi email (mode test)">
      <SendInvoiceEmailClient invoiceId={id} />
    </AppShell>
  );
}
