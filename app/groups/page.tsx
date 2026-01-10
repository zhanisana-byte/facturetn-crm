import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Badge, Table } from "@/components/ui";

export default async function GroupsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", auth.user.id)
    .single();

  const { data: groups, error } = await supabase
    .from("groups")
    .select("id,group_name,created_at")
    .eq("owner_user_id", auth.user.id)
    .order("created_at", { ascending: false });

  const hasSchema = !error;

  return (
    <AppShell title="Groupes" subtitle="Multi-sociétés — espaces de gestion (cabinet/holding)" accountType={profile?.account_type}>
      <Card title="Mes groupes" subtitle="Chaque groupe regroupe plusieurs sociétés abonnées. Vue TTN & recap global.">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <Badge>Total: {hasSchema ? (groups?.length ?? 0) : 0}</Badge>
            {!hasSchema ? <Badge>SQL à ajouter</Badge> : null}
          </div>
          <Link href="/groups/create" className="ftn-btn">+ Créer un groupe</Link>
        </div>

        {!hasSchema ? (
          <div className="ftn-alert mt-5">
            La table <b>groups</b> n&apos;existe pas encore. Ajoute ton SQL puis recharge.
          </div>
        ) : null}

        <div className="mt-5">
          {hasSchema && (groups?.length ?? 0) > 0 ? (
            <Table head={<tr><th>Groupe</th><th>Créé</th><th></th></tr>}>
              {groups!.map((g) => (
                <tr key={g.id}>
                  <td className="font-semibold">{g.group_name}</td>
                  <td className="text-sm text-slate-600">{new Date(g.created_at).toLocaleDateString()}</td>
                  <td className="text-right"><Link className="ftn-link" href={`/groups/${g.id}`}>Ouvrir</Link></td>
                </tr>
              ))}
            </Table>
          ) : hasSchema ? (
            <div className="ftn-muted">Aucun groupe pour le moment. Clique sur “Créer un groupe”.</div>
          ) : null}
        </div>
      </Card>

      <div className="ftn-kpi-grid mt-6">
        <div className="ftn-kpi">
          <div className="ftn-kpi-label">Principe</div>
          <div className="ftn-kpi-value">Groupe gratuit</div>
          <div className="ftn-kpi-sub">Organisation + reporting</div>
        </div>
        <div className="ftn-kpi">
          <div className="ftn-kpi-label">Sociétés</div>
          <div className="ftn-kpi-value">Illimité</div>
          <div className="ftn-kpi-sub">Mais <b>abonnement requis</b> par société</div>
        </div>
        <div className="ftn-kpi">
          <div className="ftn-kpi-label">TTN</div>
          <div className="ftn-kpi-value">Par société</div>
          <div className="ftn-kpi-sub">Vue globale au niveau groupe</div>
        </div>
        <div className="ftn-kpi">
          <div className="ftn-kpi-label">Accès</div>
          <div className="ftn-kpi-value">Par tâche</div>
          <div className="ftn-kpi-sub">Équipe interne + comptables externes</div>
        </div>
      </div>
    </AppShell>
  );
}
