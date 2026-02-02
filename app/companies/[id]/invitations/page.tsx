import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvitationsSocieteClient from "./InvitationsSocieteClient";

export const dynamic = "force-dynamic";

export default async function CompanyInvitationsPage(props: { params?: Promise<{ id: string }> }) {
  const params = (await props.params) ?? ({} as any);
  const { id: companyId } = params as any;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,owner_user_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="ftn-alert tone-bad">Société introuvable.</div>
      </div>
    );
  }

  const { data: myMembership } = await supabase
    .from("memberships")
    .select("role,is_active")
    .eq("company_id", companyId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const myRole = String((myMembership as any)?.role || "viewer");
  const isOwner = myRole === "owner" || String((company as any).owner_user_id) === auth.user.id;
  const isAdmin = myRole === "staff";

  const { data: invites } = await supabase
    .from("access_invitations")
    .select(
      "id,invited_email,role,objective,status,expires_at,created_at,token,can_manage_customers,can_create_invoices,can_validate_invoices,can_submit_ttn"
    )
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: groupInvites } = await supabase
    .from("group_company_invitations")
    .select("id,status,invited_email,created_at,group_id,groups(group_name,group_type)")
    .eq("company_id", companyId)
    .in("status", ["pending", "accepted", "declined", "revoked"])
    .order("created_at", { ascending: false });

  const { data: myGroups } = await supabase
    .from("groups")
    .select("id,group_name,group_type,owner_user_id")
    .or(`owner_user_id.eq.${auth.user.id}`)
    .order("created_at", { ascending: false });

  const { data: memberGroups } = await supabase
    .from("group_members")
    .select("group_id,role,is_active,groups(id,group_name,group_type,owner_user_id)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  const merged: any[] = [];
  const seen = new Set<string>();
  const pushGroup = (g: any) => {
    if (!g?.id) return;
    if (seen.has(g.id)) return;
    seen.add(g.id);
    merged.push({
      id: g.id,
      group_name: g.group_name,
      group_type: g.group_type,
      owner_user_id: g.owner_user_id,
    });
  };

  (myGroups as any[] | null)?.forEach(pushGroup);
  (memberGroups as any[] | null)?.forEach((row) => {
    const r: any = row as any;
    if (["owner", "admin"].includes(String(r?.role))) pushGroup(r?.groups);
  });

  return (
    <InvitationsSocieteClient
      companyId={companyId}
      companyName={company.company_name ?? "Société"}
      myRole={myRole}
      isOwner={isOwner}
      isAdmin={isAdmin}
      initialRows={(invites as any[]) ?? []}
      initialGroupInvites={(groupInvites as any[]) ?? []}
      myGroups={(merged as any[]) ?? []}
    />
  );
}
