import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";
import RecapClient from "./RecapClient";

export const dynamic = "force-dynamic";
type PageRow = {
  id: string;
  company_name?: string | null;
  tax_id?: string | null;
  page_type?: string | null; // si vous as un champ type (societe/cabinet/multi)
};

type TeamRow = {
  company_id: string;
  company_name: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
};

type GroupRow = {
  id: string;
  group_name: string | null;
  my_role: string;
};

export default async function RecapPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const userId = auth.user.id;

  // 1) Mes pages (pages où je suis owner OU membre admin)
  // - owner : companies.owner_user_id (si existe)
  // - admin : memberships.role = 'admin' (si existe)
  //
  // ⚠️ si owner_user_id n’existe pas dans companies, on ne casse pas : on affiche juste memberships.
  const pages: PageRow[] = [];

  // A) pages owner (si votre schema le supporte)
  const { data: ownedCompanies, error: ownedErr } = await supabase
    .from("companies")
    .select("id, company_name, tax_id, page_type, owner_user_id")
    .eq("owner_user_id", userId);

  if (!ownedErr && ownedCompanies?.length) {
    for (const c of ownedCompanies as any[]) {
      pages.push({
        id: c.id,
        company_name: c.company_name ?? null,
        tax_id: c.tax_id ?? null,
        page_type: c.page_type ?? null,
      });
    }
  }

  // B) pages où je suis membre (admin/owner/staff/viewer) -> on filtre ensuite côté UI
  const { data: myMemberships } = await supabase
    .from("memberships")
    .select("company_id, role, companies(id, company_name, tax_id, page_type)")
    .eq("user_id", userId);

  const memPages = (myMemberships ?? [])
    .map((m: any) => m.companies)
    .filter(Boolean)
    .map((c: any) => ({
      id: c.id,
      company_name: c.company_name ?? null,
      tax_id: c.tax_id ?? null,
      page_type: c.page_type ?? null,
    })) as PageRow[];

  // merge unique
  const byId = new Map<string, PageRow>();
  for (const p of [...pages, ...memPages]) byId.set(p.id, p);
  const myPages = Array.from(byId.values());

  // 2) Mes équipes (tous les membres des pages que je gère)
  // 👉 On prend les memberships de toutes mes pages (company_id IN myPages)
  // et on joint app_users pour afficher nom/email.
  let teams: TeamRow[] = [];

  if (myPages.length) {
    const ids = myPages.map((p) => p.id);

    const { data: allMembers, error: membersErr } = await supabase
      .from("memberships")
      .select(
        "company_id, role, user_id, app_users(email, full_name), companies(company_name)"
      )
      .in("company_id", ids);

    if (!membersErr && allMembers?.length) {
      teams = (allMembers as any[]).map((r) => ({
        company_id: r.company_id,
        company_name: r.companies?.company_name ?? "Page",
        user_id: r.user_id,
        email: r.app_users?.email ?? "",
        full_name: r.app_users?.full_name ?? "",
        role: String(r.role ?? "member"),
      }));
    }
  }

  // 3) Mes groupes (owner/admin/staff)
  const { data: ownedGroupsRaw } = await supabase
    .from("groups")
    .select("id, group_name")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });

  const { data: groupMembershipsRaw } = await supabase
    .from("group_members")
    .select("group_id, role, groups(id, group_name)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const groupsById = new Map<string, GroupRow>();
  (ownedGroupsRaw ?? []).forEach((g: any) => {
    if (!g?.id) return;
    groupsById.set(String(g.id), { id: String(g.id), group_name: g.group_name ?? null, my_role: "owner" });
  });
  (groupMembershipsRaw ?? []).forEach((gm: any) => {
    const id = String(gm?.group_id || gm?.groups?.id || "");
    if (!id) return;
    if (!groupsById.has(id)) {
      groupsById.set(id, { id, group_name: gm?.groups?.group_name ?? null, my_role: String(gm?.role || "staff") });
    }
  });
  const myGroups = Array.from(groupsById.values());

  return (
    <AppShell accountType="profil"
      title="Récap accès"
      subtitle="Mes pages + les personnes qui ont accès à mes pages."
    >
      <div className="ftn-grid gap-4">
        <Card title="Mes pages" subtitle="Pages où vous avez un rôle (owner/admin/membre).">
          <RecapClient pages={myPages} teams={teams} />
        </Card>

        <Card title="Mes groupes" subtitle="Groupes où vous avez un rôle (owner/admin/staff).">
          {myGroups.length ? (
            <div className="space-y-2">
              {myGroups.map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 bg-white">
                  <div>
                    <div className="font-semibold">{g.group_name || "Groupe"}</div>
                    <div className="text-xs text-slate-600">Mon rôle: {String(g.my_role).toUpperCase()}</div>
                  </div>
                  <Link className="ftn-btn-ghost" href={`/groups/${g.id}`}>
                    Ouvrir
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-600">Aucun groupe trouvé.</div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
