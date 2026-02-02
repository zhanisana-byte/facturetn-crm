import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Nav } from "@/components/ui";
import AccessClient from "./AccessClient";

type PageProps = { params: Promise<{ id: string }> };

export default async function CompanyAccessPage({ params }: PageProps) {
  const { id: companyId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type, email, full_name")
    .eq("id", auth.user.id)
    .single();

  const { data: myMembership } = await supabase
    .from("memberships")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", auth.user.id)
    .single();

  if (!myMembership) redirect("/companies");

  return (
    <div className="p-6">
      <Nav accountType={profile?.account_type ?? undefined} />

      <AccessClient
        companyId={companyId}
        canInvite={myMembership.role === "owner"}
      />
    </div>
  );
}
