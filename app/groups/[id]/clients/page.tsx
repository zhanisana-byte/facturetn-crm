// app/groups/[id]/clients/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GroupClientsClient from "./GroupClientsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = { params: Promise<{ id: string }> };

function isCompanyComplete(c: any): boolean {
  if (!c) return false;
  const required = [c.company_name, c.tax_id, c.address, c.city, c.postal_code, c.country];
  return required.every((x) => String(x ?? "").trim().length > 0);
}

function isTTNComplete(t: any): boolean {
  if (!t) return false;
  const type = String(t.connection_type ?? "").toLowerCase();
  if (type === "webservice") {
    return Boolean(t.ws_url && t.ws_login && t.ws_password && t.ws_matricule);
  }
  if (type === "api") {
    return Boolean(t.api_key && t.env);
  }
  return Boolean(t.ws_url && t.ws_login && t.ws_password && t.ws_matricule);
}

function permsLabel(m: any) {
  const a: string[] = [];
  if (m?.can_manage_customers) a.push("Clients");
  if (m?.can_create_invoices) a.push("Factures");
  if (m?.can_validate_invoices) a.push("Validation");
  if (m?.can_submit_ttn) a.push("TTN");
  return a.length ? a.join(", ") : "—";
}

export default async function GroupClientsPage({ params }: PageProps) {
  const { id: groupId } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  const { data: group } = await supabase
    .from("groups")
    .select("id,owner_user_id,group_name")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) redirect("/groups/select");

  const isOwner = group.owner_user_id === userId;
  let role: string | null = isOwner ? "owner" : null;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    role = gm?.role ?? null;
  }
  if (!isOwner && role !== "admin") redirect("/groups/select");

  // ✅ Action: retirer une société du groupe (interne/externe) = delete group_companies link
  async function removeCompanyFromGroup(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    const companyId = String(formData.get("company_id") ?? "").trim();
    const groupId2 = String(formData.get("group_id") ?? "").trim();
    if (!companyId || !groupId2) redirect(`/groups/${groupId2}/clients`);

    // verify rights
    const { data: g } = await supabase
      .from("groups")
      .select("id,owner_user_id")
      .eq("id", groupId2)
      .maybeSingle();

    if (!g?.id) redirect("/groups/select");
    const isOwner = g.owner_user_id === auth.user.id;

    let myRole: string | null = isOwner ? "owner" : null;
    if (!isOwner) {
      const { data: gm } = await supabase
        .from("group_members")
        .select("role,is_active")
        .eq("group_id", groupId2)
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();
      myRole = gm?.role ?? null;
    }

    if (!isOwner && myRole !== "admin") redirect("/groups/select");

    await supabase
      .from("group_companies")
      .delete()
      .eq("group_id", groupId2)
      .eq("company_id", companyId);

    redirect(`/groups/${groupId2}/clients?ok=removed`);
  }

  // 1) Liens groupe->sociétés
  const { data: links, error } = await supabase
    .from("group_companies")
    .select("company_id, link_type, subscription_ends_at, companies(*)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) {
    return <div className="ftn-alert">Erreur lecture group_companies : {error.message}</div>;
  }

  const raw = (links ?? []).map((l: any) => ({
    companyId: String(l?.companies?.id ?? l?.company_id),
    linkType: (l?.link_type ?? "internal") === "external" ? "external" : "internal",
    subscriptionEndsAt: l?.subscription_ends_at ?? null,
    company: l?.companies ?? null,
  }));

  const companyIds = raw.map((r) => r.companyId).filter(Boolean);

  // 2) TTN settings (statut complet ou non)
  const ttnMap = new Map<string, { exists: boolean; complete: boolean }>();
  if (companyIds.length) {
    const { data: ttnRows } = await supabase
      .from("company_ttn_settings")
      .select("*")
      .in("company_id", companyIds);

    (ttnRows ?? []).forEach((t: any) => {
      ttnMap.set(String(t.company_id), { exists: true, complete: isTTNComplete(t) });
    });
  }

  // 3) Membres / permissions (résumé)
  const membersMap = new Map<string, any[]>();
  if (companyIds.length) {
    const { data: mems } = await supabase
      .from("memberships")
      .select(
        "company_id,user_id,role,is_active,can_manage_customers,can_create_invoices,can_validate_invoices,can_submit_ttn,app_users(full_name,email)"
      )
      .in("company_id", companyIds)
      .eq("is_active", true);

    (mems ?? []).forEach((m: any) => {
      const cid = String(m.company_id);
      const arr = membersMap.get(cid) ?? [];
      arr.push({
        userId: String(m.user_id),
        name: String(m.app_users?.full_name ?? m.app_users?.email ?? "Utilisateur"),
        email: String(m.app_users?.email ?? ""),
        role: String(m.role ?? ""),
        perms: permsLabel(m),
      });
      membersMap.set(cid, arr);
    });
  }

  const rows = raw.map((r) => {
    const c = r.company ?? {};
    const cid = r.companyId;

    const ttn = ttnMap.get(cid) ?? { exists: false, complete: false };
    const members = membersMap.get(cid) ?? [];

    return {
      id: cid,
      name: String(c.company_name ?? "Société"),
      taxId: String(c.tax_id ?? "—"),
      linkType: r.linkType as "internal" | "external",
      companyComplete: isCompanyComplete(c),
      ttnComplete: ttn.exists ? ttn.complete : false,
      ttnExists: ttn.exists,
      members,
      subscriptionEndsAt: r.subscriptionEndsAt as string | null,
    };
  });

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Mes sociétés</div>
            <div className="text-sm opacity-80">{group.group_name}</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="ftn-btn" href={`/groups/${groupId}`} prefetch={false}>
              Dashboard
            </Link>

            <Link className="ftn-btn" href={`/groups/${groupId}/companies/new`} prefetch={false}>
              + Créer société interne
            </Link>

            {/* ✅ supprimé: + Ajouter société externe */}
            <Link className="ftn-btn ftn-btn-ghost" href={`/groups/${groupId}/invitations-received`} prefetch={false}>
              Invitations reçues
            </Link>
          </div>
        </div>
      </div>

      <div className="ftn-card p-4">
        <GroupClientsClient groupId={groupId} rows={rows} removeAction={removeCompanyFromGroup} />
      </div>
    </div>
  );
}
