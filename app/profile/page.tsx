import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/server";
import AppShell from "@/app/components/AppShell";
import ProfileClient from "./ProfileClient";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfilePage() {
  const { supabase, user } = await getAuthUser();

  // Workspace
  const ws = await ensureWorkspaceRow(supabase);
  const activeMode = ws?.active_mode ?? "profil";

  // /profile فقط للـ profil + (اختياري) multi_societe
  if (activeMode !== "profil" && activeMode !== "multi_societe") {
    redirect("/dashboard");
  }

  // User
  const { data: me, error: meErr } = await supabase
    .from("app_users")
    .select("id,email,full_name,account_type")
    .eq("id", user.id)
    .single();

  if (meErr || !me) {
    return (
      <AppShell title="Profil" accountType={shellTypeFromWorkspace(activeMode)}>
        <div className="p-6">
          <p className="text-sm text-slate-600">Impossible de charger le profil.</p>
        </div>
      </AppShell>
    );
  }

  // Group (optionnel)
  let group: any = null;
  if (activeMode === "multi_societe") {
    const groupId = ws?.active_group_id;
    if (!groupId) redirect("/groups");
    const { data: g } = await supabase
      .from("groups")
      .select("id,group_name,created_at")
      .eq("id", groupId)
      .single();
    group = g ?? null;
  }

  return (
    <AppShell title="Profil" accountType={shellTypeFromWorkspace(activeMode)}>
      <ProfileClient initialUser={me} activeMode={activeMode} group={group ?? undefined} />
    </AppShell>
  );
}
