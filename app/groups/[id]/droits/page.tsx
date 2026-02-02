import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DroitsGroupeClient, { type GroupCompany } from "./DroitsGroupeClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GroupeDroitsPage(props: {
  params?: Promise<{ id: string }>;
  searchParams?: Promise<{ createdCompany?: string }>;
}) {
  const params = (await props.params) ?? ({} as any);
  const sp = (await props.searchParams) ?? {};
  const createdCompanyId = String((sp as any).createdCompany ?? "");
  const { id: groupId } = params as any;

  const supabase = await createClient();

  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, group_name, owner_user_id")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Équipe & permissions</h1>
        <p className="mt-2 text-sm text-slate-600">Groupe introuvable.</p>
      </div>
    );
  }

  const isOwner = group.owner_user_id === user.id;

  let myRole: string | null = isOwner ? "owner" : null;
  let isMember = false;

  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("id, role, is_active")
      .eq("group_id", groupId)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    isMember = !!gm?.id;
    myRole = gm?.role ?? null;
  }

  const canManage = isOwner || myRole === "admin";
  if (!isOwner && !isMember) redirect("/groups");

  const { data: members } = await supabase
    .from("group_members")
    .select(
      `
      id,
      user_id,
      role,
      permissions,
      is_active,
      created_at,
      app_users:app_users (
        full_name,
        email
      )
    `
    )
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  const { data: links } = await supabase
    .from("group_companies")
    .select("company_id, link_type, companies(id,company_name,tax_id)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const companies: GroupCompany[] = (links ?? []).map((l: any) => {
    const c = l?.companies;
    return {
      id: String(c?.id ?? l?.company_id ?? ""),
      name: String(c?.company_name ?? "Société"),
      taxId: String(c?.tax_id ?? "—"),
      "managed",
    };
  });

  return (
    <DroitsGroupeClient
      groupId={groupId}
      groupName={group.group_name ?? "Groupe"}
      isOwner={isOwner}
      myRole={myRole}
      canManage={canManage}
      members={(members as any[]) ?? []}
      companies={companies}
      createdCompanyId={createdCompanyId || null}
    />
  );
}
