import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Table, Badge } from "@/components/ui";
import { mapDbAccountType } from "@/app/types";

export const dynamic = "force-dynamic";
export default async function RolesHubPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const userId = auth.user.id;

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type,full_name")
    .eq("id", userId)
    .maybeSingle();

  const accountType = mapDbAccountType(profile?.account_type);

  // Sociétés où je suis owner
  // NOTE: selon les versions du schéma, owner_user_id peut ne pas être rempli.
  // La source fiable est la table memberships (role='owner').
  const { data: ownedCompaniesRaw } = await supabase
    .from("memberships")
    .select("company_id, role, companies(id,company_name,tax_id)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("role", "owner")
    .order("created_at", { ascending: false });

  const ownedCompanies = (ownedCompaniesRaw ?? []).map((m: any) => m.companies).filter(Boolean);

  const { data: memberCompaniesRaw } = await supabase
    .from("memberships")
    .select("id,role,company_id,companies(id,company_name,tax_id)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const memberCompanies = memberCompaniesRaw ?? [];

  // Groupes où je suis owner ou admin/staff
  const { data: ownedGroupsRaw } = await supabase
    .from("groups")
    .select("id,group_name,created_at")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });
  const ownedGroups = ownedGroupsRaw ?? [];

  const { data: groupMembershipsRaw } = await supabase
    .from("group_members")
    .select("id,group_id,role,groups(id,group_name)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  const groupMemberships = groupMembershipsRaw ?? [];

  return (
    <AppShell
      title="Rôles & Permissions"
      subtitle="Tout ce que vous gérez (Sociétés / Groupes) + page Droits"
      accountType={accountType}
    >
      <div className="mx-auto w-full max-w-6xl p-6 space-y-6">
        <div className="ftn-kpi-grid">
          <div className="ftn-kpi">
            <div className="ftn-kpi-label">Sociétés (owner)</div>
            <div className="ftn-kpi-value">{ownedCompanies.length}</div>
            <div className="ftn-kpi-sub">Accès complet</div>
          </div>
          <div className="ftn-kpi">
            <div className="ftn-kpi-label">Sociétés (invité)</div>
            <div className="ftn-kpi-value">{memberCompanies.filter((m: any) => String(m.role) !== "owner").length}</div>
            <div className="ftn-kpi-sub">Selon permissions</div>
          </div>
          <div className="ftn-kpi">
            <div className="ftn-kpi-label">Groupes</div>
            <div className="ftn-kpi-value">{ownedGroups.length + groupMemberships.length}</div>
            <div className="ftn-kpi-sub">Owner / Admin / Staff</div>
          </div>
        </div>

        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-sm font-semibold">Sociétés</div>
                <div className="text-xs text-slate-500">cliquez sur “Droits” pour gérer rôles/permissions.</div>
              </div>
              <Link className="ftn-btn" href="/companies">Aller à Sociétés</Link>
            </div>

            <Table head={<tr><th>Société</th><th>MF</th><th>Mon rôle</th><th></th></tr>}>
              {ownedCompanies.map((c: any) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.company_name ?? "—"}</td>
                  <td>{c.tax_id ?? "—"}</td>
                  <td><Badge>OWNER</Badge></td>
                  <td className="text-right">
                    <Link className="ftn-link" href={`/companies/${c.id}/droits`}>Droits</Link>
                  </td>
                </tr>
              ))}
              {memberCompanies
                .filter((m: any) => String(m.role) !== "owner")
                .map((m: any) => (
                <tr key={m.id}>
                  <td className="font-semibold">{m.companies?.company_name ?? "—"}</td>
                  <td>{m.companies?.tax_id ?? "—"}</td>
                  <td><Badge>{String(m.role || "viewer").toUpperCase()}</Badge></td>
                  <td className="text-right">
                    <Link className="ftn-link" href={`/companies/${m.company_id}/droits`}>Voir</Link>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-sm font-semibold">Groupes</div>
                <div className="text-xs text-slate-500">Gérer l’équipe et permissions du groupe.</div>
              </div>
              <Link className="ftn-btn" href="/groups">Aller à Groupes</Link>
            </div>

            <Table head={<tr><th>Groupe</th><th>Mon rôle</th><th></th></tr>}>
              {ownedGroups.map((g: any) => (
                <tr key={g.id}>
                  <td className="font-semibold">{g.group_name ?? "—"}</td>
                  <td><Badge>OWNER</Badge></td>
                  <td className="text-right">
                    <Link className="ftn-link" href={`/groups/${g.id}/droits`}>Droits</Link>
                  </td>
                </tr>
              ))}
              {groupMemberships.map((gm: any) => (
                <tr key={gm.id}>
                  <td className="font-semibold">{gm.groups?.group_name ?? "—"}</td>
                  <td><Badge>{String(gm.role || "staff").toUpperCase()}</Badge></td>
                  <td className="text-right">
                    <Link className="ftn-link" href={`/groups/${gm.group_id}/droits`}>Droits</Link>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
