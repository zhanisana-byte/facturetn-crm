import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import ProfileClient from "./ProfileClient";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,email,full_name,account_type,accountant_status,accountant_mf,accountant_patente,plan_code,max_companies,trial_ends_at,subscription_ends_at")
    .eq("id", auth.user.id)
    .single();

  // Companies owned by this user (for inviting accountant on a specific company)
  const { data: myCompanies } = await supabase
    .from("companies")
    .select("id, company_name, tax_id")
    .eq("owner_user", auth.user.id)
    .order("created_at", { ascending: false });

  return (
    <AppShell
      title="Profil"
      subtitle="Paramètres compte + informations comptable si besoin."
      accountType={(profile?.account_type as any) ?? undefined}
    >
      <ProfileClient initial={profile} companies={myCompanies ?? []} />
    </AppShell>
  );
}
