import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";
import GroupClientsClient from "./GroupClientsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string }> };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type Row = {
  id: string;
  name: string;
  taxId: string;
  linkType: "internal" | "external";
};

export default async function GroupClientsPage({ params }: PageProps) {
  const { id  } = await params;
  if (!isUuid(id)) redirect("/groups/select");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase);
  // ✅ Stabiliser le contexte du groupe (sidebar fixe)
  if (ws?.active_mode !== "multi_societe" || ws?.active_group_id !== id) {
    await supabase
      .from("user_workspace")
      .upsert(
        {
          user_id: auth.user.id,
          active_mode: "multi_societe",
          active_company_id: null,
          active_group_id: id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  }

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id,group_name,owner_user_id")
    .eq("id", id)
    .maybeSingle();

  if (groupErr || !group) {
    return (
      <AppShell title="Groupe" subtitle="Mes clients" accountType={shellTypeFromWorkspace("multi_societe")} activeGroupId={id}>
        <div className="ftn-alert">Groupe introuvable: {groupErr?.message}</div>
      </AppShell>
    );
  }

  // ✅ Authorisation: owner ou admin actif (group_members)
  const isOwner = group.owner_user_id === auth.user.id;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", id)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();
    const ok = Boolean(gm?.is_active && (gm.role === "admin" || gm.role === "owner"));
    if (!ok) {
      return (
        <AppShell
          title={group.group_name}
          subtitle="Mes clients"
          accountType={shellTypeFromWorkspace("multi_societe")}
          activeGroupId={id}
        >
          <div className="ftn-alert">Accès refusé.</div>
        </AppShell>
      );
    }
  }

  // ✅ Une seule liste: sociétés internes + externes (même tableau)
  const { data: links, error: linksErr } = await supabase
    .from("group_companies")
    .select("company_id, link_type, companies(id,company_name,tax_id)")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const rows: Row[] =
    (links ?? []).map((l: any) => {
      const c = l?.companies;
      return {
        id: String(c?.id ?? l?.company_id ?? ""),
        name: String(c?.company_name ?? "Société"),
        taxId: String(c?.tax_id ?? "—"),
        linkType: (l?.link_type ?? "internal") === "external" ? "external" : "internal",
      };
    }) ?? [];

  return (
    <AppShell title={group.group_name} subtitle="Mes clients" accountType={shellTypeFromWorkspace("multi_societe")} activeGroupId={id}>
      <Card
        title="Mes clients (sociétés internes & externes)"
        subtitle="Une seule liste pour piloter le groupe. Cliquez sur une société pour gérer TTN / accès."
      >
        <div className="flex gap-2 flex-wrap justify-end">
          <Link className="ftn-btn" href={`/companies/create`}>+ Créer société interne</Link>
          <Link className="ftn-btn-ghost" href={`/groups/externals`}>+ Ajouter société externe</Link>
        </div>

        {linksErr ? (
          <div className="ftn-alert mt-4">
            Table <b>group_companies</b> manquante ou accès refusé: {linksErr.message}
          </div>
        ) : null}

        <div className="mt-4">
          <GroupClientsClient groupId={id} rows={rows} />
        </div>
      </Card>
    </AppShell>
  );
}
