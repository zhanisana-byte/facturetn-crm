
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CabinetTeamPermissionsClient from "./CabinetTeamPermissionsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type MemberRow = {
  user_id: string;
  role: string | null;
  is_active: boolean | null;
  created_at?: string | null;
  app_users?: { full_name?: string | null; email?: string | null } | null;
};

export default async function TeamPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: ws } = await supabase
    .from("user_workspace")
    .select("active_group_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const cabinetId = ws?.active_group_id ?? null;
  if (!cabinetId) redirect("/switch");

  const { data: cabinet } = await supabase
    .from("groups")
    .select("id, group_name, group_type")
    .eq("id", cabinetId)
    .maybeSingle();

  if (!cabinet?.id || String(cabinet.group_type ?? "") !== "cabinet") {
    redirect("/switch");
  }

  const cabinetName = String(cabinet.group_name ?? "Cabinet");

  const { data: me } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", cabinetId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const { data: rawMembers } = await supabase
    .from("group_members")
    .select(
      `
      user_id,
      role,
      is_active,
      created_at,
      app_users (
        full_name,
        email
      )
    `
    )
    .eq("group_id", cabinetId);

  const members: MemberRow[] = (rawMembers ?? []).map((m: any) => ({
    user_id: String(m.user_id),
    role: (m.role ?? null) as any,
    is_active: (m.is_active ?? null) as any,
    created_at: (m.created_at ?? null) as any,
    app_users: Array.isArray(m.app_users) ? (m.app_users[0] ?? null) : (m.app_users ?? null),
  }));

  const { data: rawLinks } = await supabase
    .from("group_company_links")
    .select(
      `
      company_id,
      is_active,
      companies (
        id,
        company_name,
        tax_id
      )
    `
    )
    .eq("group_id", cabinetId)
    .eq("is_active", true);

  const companies = (rawLinks ?? [])
    .map((c: any) => c?.companies ?? null)
    .filter(Boolean);

  const { data: permissions } = await supabase
    .from("accountant_company_assignments")
    .select("*")
    .eq("group_id", cabinetId);

  return (
    <CabinetTeamPermissionsClient
      cabinetId={String(cabinetId)}
      cabinetName={cabinetName}
      myRole={String(me?.role ?? "member")}
      members={members}
      companies={companies ?? []}
      permissions={permissions ?? []}
    />
  );
}
