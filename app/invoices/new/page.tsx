import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import NewInvoiceClient from "./NewInvoiceClient";
import { mapDbAccountType } from "@/app/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type,email")
    .eq("id", auth.user.id)
    .single();

  const t = mapDbAccountType(profile?.account_type);
  // ✅ Factures visibles uniquement Profil Pro + Société
  if (t !== "profil" && t !== "entreprise") redirect("/dashboard");

  return (
    <AppShell
      title="Nouvelle facture"
      subtitle="Création rapide — on finalise le template TTN ensuite"
      accountType={t}
    >
      <Suspense fallback={<div className="p-6">Chargement...</div>}>
        <NewInvoiceClient />
      </Suspense>
    </AppShell>
  );
}
