import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import NewInvoiceClient from "./NewInvoiceClient";

export default async function Page() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type,email")
    .eq("id", auth.user.id)
    .single();

  return (
    <AppShell
      title="Nouvelle facture"
      subtitle="Création rapide — on finalise le template TTN ensuite"
      accountType={(profile?.account_type as any) ?? undefined}
    >
      <Suspense fallback={<div className="p-6">Chargement...</div>}>
        <NewInvoiceClient />
      </Suspense>
    </AppShell>
  );
}
