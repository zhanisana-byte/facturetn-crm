import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import SwitchClient from "./SwitchClient";
import { ensureWorkspaceRow, shellTypeFromWorkspace, type ActiveMode } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanyRow = { id: string; company_name: string };
type GroupRow = { id: string; group_name: string; group_type: "multi" | "cabinet" };

export default async function SwitchPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase);
  const activeMode: ActiveMode = ws?.active_mode ?? "profil";

  // SOCIETES
  const { data: memberships } = await supabase
    .from("memberships")
    .select("company_id, companies(id, company_name)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  const companies: CompanyRow[] =
    (memberships ?? [])
      .map((m: any) => m?.companies)
      .filter(Boolean)
      .map((c: any) => ({ id: c.id, company_name: c.company_name })) ?? [];

  // ✅ Inclure aussi les sociétés dont je suis OWNER (au cas où membership manque)
  const { data: ownedCompanies } = await supabase
    .from("companies")
    .select("id,company_name")
    .eq("owner_user", auth.user.id);

  const companiesAll: CompanyRow[] = (() => {
    const map = new Map<string, CompanyRow>();
    (companies ?? []).forEach((c) => map.set(c.id, c));
    (ownedCompanies ?? []).forEach((c: any) => {
      if (c?.id) map.set(String(c.id), { id: String(c.id), company_name: String(c.company_name ?? "Société") });
    });
    return Array.from(map.values());
  })();

  // GROUPES / CABINETS
  const { data: groupMembers } = await supabase
    .from("group_members")
    .select("group_id, is_active, groups(id, group_name, group_type)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  const groups: GroupRow[] =
    (groupMembers ?? [])
      .map((gm: any) => gm?.groups)
      .filter(Boolean)
      .map((g: any) => ({
        id: g.id,
        group_name: g.group_name,
        group_type: (g.group_type ?? "multi") as "multi" | "cabinet",
      })) ?? [];

  // ✅ Inclure aussi les groupes/cabinets dont je suis OWNER (au cas où group_members manque)
  const { data: ownedGroups } = await supabase
    .from("groups")
    .select("id,group_name,group_type")
    .eq("owner_user_id", auth.user.id);

  const groupsAll: GroupRow[] = (() => {
    const map = new Map<string, GroupRow>();
    (groups ?? []).forEach((g) => map.set(g.id, g));
    (ownedGroups ?? []).forEach((g: any) => {
      if (g?.id) {
        map.set(String(g.id), {
          id: String(g.id),
          group_name: String(g.group_name ?? "Groupe"),
          group_type: (g.group_type ?? "multi") as "multi" | "cabinet",
        });
      }
    });
    return Array.from(map.values());
  })();

  // SERVER ACTION: switch workspace
  async function setWorkspace(mode: ActiveMode, companyId: string | null, groupId: string | null) {
    "use server";
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    await supabase.from("user_workspace").upsert(
      {
        user_id: auth.user.id,
        active_mode: mode,
        active_company_id: companyId,
        active_group_id: groupId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  return (
    <AppShell
      title="Switch"
      subtitle="Choisissez l’espace à ouvrir"
      accountType={shellTypeFromWorkspace(activeMode)}
      activeCompanyId={ws?.active_company_id ?? null}
      activeGroupId={ws?.active_group_id ?? null}
    >
      <div className="mx-auto w-full max-w-5xl p-6">
        <SwitchClient companies={companiesAll} groups={groupsAll} setWorkspace={setWorkspace} />
      </div>
    </AppShell>
  );
}
