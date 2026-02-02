import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export default async function CompanyTTNChooser() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: memberships } = await supabase
    .from("memberships")
    .select("company_id, is_active")
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  const firstCompanyId = memberships?.[0]?.company_id;
  if (firstCompanyId) redirect(`/companies/${firstCompanyId}/ttn`);

  redirect("/companies");
}
