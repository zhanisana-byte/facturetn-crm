import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DroitsCabinetClient from "./DroitsCabinetClient";

export const dynamic = "force-dynamic";
export default async function AccountantDroitsPage() {
  const supabase = await createClient();

  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id, account_type, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const at = String(profile?.account_type ?? "").toLowerCase().trim();
  if (!profile || !["cabinet", "comptable"].includes(at)) {
    redirect("/accountant");
  }

  const { data: cabinetList } = await supabase
    .from("companies")
    .select("id, company_name, tax_id, owner_user_id")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinet = (cabinetList ?? [])[0];
  if (!cabinet?.id) redirect("/accountant/cabinet");

  const isOwner = cabinet.owner_user_id === user.id;

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
      app_users:app_users(
        full_name,
        email
      )
    `
    )
    .eq("company_id", cabinet.id)
    .order("created_at", { ascending: true });

  return (
<DroitsCabinetClient
        companyId={cabinet.id}
        cabinetName={cabinet.company_name ?? "Cabinet"}
        isOwner={isOwner}
        members={(members as any[]) ?? []}
      />
  );
}
