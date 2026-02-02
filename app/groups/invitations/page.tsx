import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GroupsInvitationsPage() {
  const supabase = await createClient();
  const { data: s } = await supabase.auth.getSession();
  if (!s.session?.user) redirect("/login");

  return (
    <AppShell title="Invitations" subtitle="Espace Profil">
      <div className="ftn-card-lux ftn-reveal">
        <div className="ftn-card-glow" />
        <div className="ftn-card-head">
          <div className="ftn-card-titleRow">
            <div className="ftn-ic"></div>
            <div>
              <div className="ftn-card-title">Invitations groupe</div>
              <div className="ftn-card-sub">
                (Placeholder) Cette page peut lister les invitations reçues / envoyées liées aux groupes.
              </div>
            </div>
          </div>
          <div className="ftn-card-right">
            <Link className="ftn-btn-ghost" href="/groups">
              Retour
            </Link>
          </div>
        </div>
        <div className="ftn-card-body">
          <div className="ftn-muted">
            Si vous veux, je te branche la vraie logique (tables invitations, accept/refuse) selon votre schéma.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
