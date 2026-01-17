import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import DroitsSocieteClient from "@/app/companies/[id]/droits/DroitsSocieteClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountantRolesPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const userId = auth.user.id;

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.account_type !== "comptable") {
    redirect("/dashboard");
  }

  // Société du cabinet : la première société owned par ce user
  const { data: cabinetList } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,created_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinet = (cabinetList ?? [])[0];
  if (!cabinet?.id) redirect("/accountant/cabinet");

  const cabinetId = cabinet.id;

  const { data: members } = await supabase
    .from("memberships")
    .select(
      `
      id,
      user_id,
      role,
      is_active,
      can_manage_customers,
      can_create_invoices,
      can_validate_invoices,
      can_submit_ttn,
      created_at,
      app_users:app_users (
        full_name,
        email
      )
    `
    )
    .eq("company_id", cabinetId)
    .order("created_at", { ascending: true });

  return (
    <AppShell title="Rôles" subtitle={cabinet.company_name ?? "Cabinet"} accountType="comptable">
      <DroitsSocieteClient
        companyId={cabinetId}
        companyName={cabinet.company_name ?? "Cabinet"}
        isOwner={true}
        members={(members as any[]) ?? []}
      />
    </AppShell>
  );
}
