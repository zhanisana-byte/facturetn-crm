import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Table } from "@/components/ui";

type PageProps = { params: Promise<{ id: string }> };
export default async function GroupDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", auth.user.id)
    .single();

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id,group_name,owner_user_id,created_at")
    .eq("id", id)
    .single();

  if (groupErr || !group) {
    return (
      <AppShell title="Groupe" subtitle="Détails" accountType={profile?.account_type}>
        <div className="ftn-alert">Groupe introuvable ou SQL manquant: {groupErr?.message}</div>
      </AppShell>
    );
  }

  if (group.owner_user_id !== auth.user.id) {
    return (
      <AppShell title={group.group_name} subtitle="Accès refusé" accountType={profile?.account_type}>
        <div className="ftn-alert">Tu n&apos;as pas accès à ce groupe.</div>
      </AppShell>
    );
  }

  const { data: links, error: linkErr } = await supabase
    .from("group_companies")
    .select("company_id, companies(id,company_name,tax_id)")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const hasLinks = !linkErr;
  const companies =
    (links ?? []).map((l: any) => ({
      id: l.companies?.id ?? l.company_id,
      name: l.companies?.company_name ?? "Société",
      taxId: l.companies?.tax_id ?? "—",
    })) ?? [];

  return (
    <AppShell title={group.group_name} subtitle="Recap groupe — sociétés, TTN, équipe" accountType={profile?.account_type}>
      <div className="ftn-kpi-grid">
        <div className="ftn-kpi">
          <div className="ftn-kpi-label">Sociétés</div>
          <div className="ftn-kpi-value">{hasLinks ? companies.length : "—"}</div>
          <div className="ftn-kpi-sub">Illimité (abonnement au niveau du groupe)</div>
        </div>
        <div className="ftn-kpi">
          <div className="ftn-kpi-label">TTN</div>
          <div className="ftn-kpi-value">
            <Link className="ftn-link" href={`/groups/${group.id}/ttn`}>Voir</Link>
          </div>
          <div className="ftn-kpi-sub">Erreurs / en attente / OK</div>
        </div>
        <div className="ftn-kpi">
          <div className="ftn-kpi-label">Accès</div>
          <div className="ftn-kpi-value">
            <Link className="ftn-link" href={`/groups/${group.id}/accountants`}>Comptables</Link>
          </div>
          <div className="ftn-kpi-sub">Permissions par tâche</div>
        </div>
        <div className="ftn-kpi">
          <div className="ftn-kpi-label">Action</div>
          <div className="ftn-kpi-value">
            <Link className="ftn-link" href={`/groups/${group.id}/companies/add`}>+ Ajouter société</Link>
          </div>
          <div className="ftn-kpi-sub">Recherche MF / email</div>
        </div>
      </div>

      <Card title="Sociétés du groupe" subtitle="Clique sur une société pour voir ses factures">
        <div className="flex gap-2 flex-wrap justify-end">
          <Link className="ftn-btn-ghost" href={`/groups/${group.id}/team`}>Équipe</Link>
          <Link className="ftn-btn-ghost" href={`/groups/${group.id}/archives`}>Archives</Link>
        </div>

        {!hasLinks ? (
          <div className="ftn-alert mt-4">
            La table <b>group_companies</b> n&apos;existe pas encore. Ajoute ton SQL puis recharge.
          </div>
        ) : null}

        <div className="mt-4">
          {hasLinks && companies.length > 0 ? (
            <Table head={<tr><th>Société</th><th>MF</th><th></th></tr>}>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td className="font-semibold">{c.name}</td>
                  <td>{c.taxId}</td>
                  <td className="text-right"><Link className="ftn-link" href={`/companies/${c.id}`}>Ouvrir</Link></td>
                </tr>
              ))}
            </Table>
          ) : hasLinks ? (
            <div className="ftn-muted">
              Aucune société liée. Clique sur <Link className="ftn-link" href={`/groups/${group.id}/companies/add`}>Ajouter société</Link>.
            </div>
          ) : null}
        </div>
      </Card>
    </AppShell>
  );
}
