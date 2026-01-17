import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspaceRow } from "@/lib/workspace/server";
import GroupSelectClient from "./GroupSelectClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GroupRow = { id: string; group_name: string | null; role: string | null };

export default async function GroupSelectPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase);

  // Liste des groupes accessibles
  const { data: memberships } = await supabase
    .from("group_members")
    .select("role,groups(id,group_name)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  const groups: GroupRow[] =
    (memberships ?? [])
      .map((m: any) => ({
        id: m.groups?.id,
        group_name: m.groups?.group_name ?? null,
        role: m.role ?? null,
      }))
      .filter((g: any) => !!g.id);

  async function activate(groupId: string) {
    "use server";
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    await supabase.from("user_workspace").upsert(
      {
        user_id: auth.user.id,
        active_mode: "multi_societe",
        active_company_id: null,
        active_group_id: groupId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    redirect(`/groups/${groupId}`);
  }

  const current = (ws?.active_group_id as string | null) ?? null;

  return (
    <AppShell title="Choisir un groupe" subtitle="Sélectionnez le contexte groupe" accountType="multi_societe" activeGroupId={current ?? undefined}>
      <div className="mx-auto w-full max-w-6xl p-6">
        <GroupSelectClient groups={groups} activate={activate} />
      </div>
    </AppShell>
  );
}
