import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import DroitsGroupeClient from "./DroitsGroupeClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GroupeDroitsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: groupId  } = await params;

  const supabase = await createClient();

  /* =========================
     AUTH
  ========================= */
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) {
    redirect("/login");
  }

  /* =========================
     GROUPE
  ========================= */
  const { data: group } = await supabase
    .from("groups")
    .select("id, group_name, owner_user_id")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) {
    return (
      <AppShell title="Droits & Accès" subtitle="Groupe" accountType="multi_societe">
        <div className="mx-auto max-w-3xl p-6">
          <h1 className="text-2xl font-semibold">Droits & Accès — Groupe</h1>
          <p className="mt-2 text-sm text-slate-600">Groupe introuvable.</p>
        </div>
      </AppShell>
    );
  }

  /* =========================
     AUTHZ : owner ou membre actif
  ========================= */
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

  if (!isOwner && !isMember) {
    // pas d'accès à ce groupe
    redirect("/groups");
  }

  /* =========================
     MEMBRES DU GROUPE
  ========================= */
  const { data: members } = await supabase
    .from("group_members")
    .select(`
      id,
      user_id,
      role,
      is_active,
      created_at,
      app_users:app_users (
        full_name,
        email
      )
    `)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  /* =========================
     RENDER
  ========================= */
  return (
    <AppShell
      title="Droits & Accès"
      subtitle={group.group_name ?? "Groupe"}
      accountType="multi_societe"
    >
      <DroitsGroupeClient
        groupId={groupId}
        groupName={group.group_name ?? "Groupe"}
        isOwner={isOwner}
        myRole={myRole}
        canManage={canManage}
        members={(members as any[]) ?? []}
      />
    </AppShell>
  );
}