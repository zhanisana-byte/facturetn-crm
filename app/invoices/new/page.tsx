import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import NewInvoiceClient from "./NewInvoiceClient";
import { mapDbAccountType } from "@/app/types";

export const dynamic = "force-dynamic";

type Company = { id: string; company_name: string };

export default async function Page() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type,is_pdg")
    .eq("id", auth.user.id)
    .maybeSingle();

  const t = mapDbAccountType(profile?.account_type);

  const { data: companiesRaw } = await supabase
    .from("companies")
    .select("id,company_name")
    .order("company_name", { ascending: true });

  const companies = (companiesRaw ?? []) as Company[];

  return (
    <AppShell title="Nouveau document" subtitle="Facture / Devis / Avoir" accountType={t}>
      <Suspense fallback={<div className="p-6">Chargement...</div>}>
        <NewInvoiceClient companies={companies} />
      </Suspense>
    </AppShell>
  );
}
