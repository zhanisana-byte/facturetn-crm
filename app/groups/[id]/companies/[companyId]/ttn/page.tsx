import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params: Promise<{ id: string; companyId: string }> };

export default async function GroupCompanyTTNRedirect({ params }: Props) {
  const { id: groupId, companyId } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: link } = await supabase
    .from("group_companies")
    .select("id")
    .eq("group_id", groupId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!link?.id) redirect(`/groups/${groupId}`);
  redirect(`/companies/${companyId}/ttn`);
}
