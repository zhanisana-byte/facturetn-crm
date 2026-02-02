import Link from "next/link";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

type SP = { group?: string };

export default async function GroupSuccessPage(props: { searchParams?: Promise<SP> }) {
  const sp = (await props.searchParams) ?? {};
  const groupId = String(sp.group || "").trim();

  return (
    <AppShell title="Groupe créé" subtitle="Espace Profil">
      <div className="ftn-card-lux ftn-reveal">
        <div className="ftn-card-glow" />
        <div className="ftn-card-head">
          <div className="ftn-card-titleRow">
            <div className="ftn-ic"></div>
            <div>
              <div className="ftn-card-title">Succès</div>
              <div className="ftn-card-sub">
                Votre groupe a été créé avec succès. Vous pouvez maintenant gérer vos sociétés gérées et recevoir des
                invitations de sociétés gérées.
              </div>
            </div>
          </div>
        </div>

        <div className="ftn-card-body">
          <div className="flex flex-wrap gap-2">
            {groupId ? (
              <>
                <Link className="ftn-btn" href={`/groups/${groupId}`} prefetch={false}>
                  Accéder au dashboard du groupe
                </Link>
                <Link className="ftn-btn ftn-btn-ghost" href={`/groups/${groupId}/clients`} prefetch={false}>
                  Gérer les sociétés
                </Link>
              </>
            ) : (
              <Link className="ftn-btn" href="/groups" prefetch={false}>
                Retour aux groupes
              </Link>
            )}

            <Link className="ftn-btn ftn-btn-ghost" href="/switch" prefetch={false}>
              Switch d’espace
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
