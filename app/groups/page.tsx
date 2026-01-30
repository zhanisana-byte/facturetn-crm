import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

type GroupRow = {
  id: string;
  group_name: string | null;
};

export default async function GroupsHomePage() {
  const supabase = await createClient();
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("group_members")
    .select("groups(id,group_name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const groups: GroupRow[] =
    (rows ?? [])
      .map((r: any) => r.groups)
      .filter(Boolean)
      .map((g: any) => ({ id: g.id, group_name: g.group_name })) || [];

  return (
    <AppShell title="Groupes" subtitle="Espace Groupe">
      <div className="ftn-wrap">
        <div className="ftn-card-lux ftn-reveal">
          <div className="ftn-card-glow" />
          <div className="ftn-card-head">
            <div className="ftn-card-titleRow">
              <div className="ftn-ic">👥</div>
              <div>
                <div className="ftn-card-title">Vos groupes</div>
                <div className="ftn-card-sub">
                  Accedez a un groupe pour afficher les societes et les parametres.
                </div>
              </div>
            </div>
            <div className="ftn-card-right">
              <Link className="ftn-btn-ghost" href="/groups/select" prefetch>
                Selectionner
              </Link>
              <Link className="ftn-btn" href="/groups/create" prefetch>
                Creer un groupe
              </Link>
            </div>
          </div>

          <div className="ftn-card-body">
            {groups.length === 0 ? (
              <div className="ftn-muted">Aucun groupe pour le moment.</div>
            ) : (
              <div className="ftn-grid">
                {groups.map((g) => (
                  <div key={g.id} className="ftn-card">
                    <div className="ftn-strong">{g.group_name ?? "Groupe"}</div>
                    <div style={{ marginTop: 10 }}>
                      <Link className="ftn-link" href={`/groups/${g.id}`} prefetch>
                        Ouvrir
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
