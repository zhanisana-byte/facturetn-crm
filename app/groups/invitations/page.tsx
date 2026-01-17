import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import GroupInvitationsClient from "./GroupInvitationsClient";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function GroupInvitations() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase.from("app_users").select("email").eq("id", auth.user.id).maybeSingle();
  const email = String(profile?.email || auth.user.email || "").toLowerCase();

  const ws = await ensureWorkspaceRow(supabase);
  const activeGroupId = (ws?.active_group_id as string | null) ?? null;
  if (!activeGroupId) redirect("/groups");

  // ✅ Stabiliser le mode (global pages n'ont pas /groups/[id])
  if (ws?.active_mode !== "multi_societe") {
    await supabase.from("user_workspace").upsert(
      {
        user_id: auth.user.id,
        active_mode: "multi_societe",
        active_company_id: null,
        active_group_id: activeGroupId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  const { data: group } = await supabase
    .from("groups")
    .select("id,group_name")
    .eq("id", activeGroupId)
    .maybeSingle();

  const { data: gm } = await supabase
    .from("group_members")
    .select("role,is_active")
    .eq("group_id", activeGroupId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const isManager = Boolean(gm?.is_active && (gm.role === "owner" || gm.role === "admin"));

  return (
    <AppShell
      title="Invitations Groupe"
      subtitle={group?.group_name ? `Groupe: ${group.group_name}` : undefined}
      accountType={shellTypeFromWorkspace("multi_societe")}
      activeGroupId={activeGroupId}
    >
      <GroupInvitationsClient groupId={activeGroupId} currentUserEmail={email} isManager={isManager} />
    </AppShell>
  );
}
