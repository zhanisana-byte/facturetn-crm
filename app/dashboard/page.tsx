import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

function formatDateFR(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR");
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Auth
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Profile (on lit les champs utiles au cabinet)
  const { data: profile, error } = await supabase
    .from("app_users")
    .select(
      "id,email,full_name,account_type,accountant_status,accountant_mf,accountant_patente,accountant_pending_until,accountant_free_access,max_companies,plan_code,subscription_status"
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error || !profile) {
    return (
      <AppShell title="Dashboard" subtitle="" accountType={undefined}>
        <div className="ftn-alert">{error?.message || "Profil introuvable."}</div>
      </AppShell>
    );
  }

  if (!profile.account_type) redirect("/onboarding");

  const accountType = profile.account_type as "client" | "cabinet" | "groupe";

  // Message positif (commun, change chaque jour)
  const dayIndex = new Date().getDate();
  const dailyPositive = [
    "Votre espace est prêt : simplicité, conformité et organisation pour la facture électronique.",
    "FactureTN vous aide à structurer vos factures pour une transition TTN sans stress.",
    "Une solution claire et professionnelle pour préparer la facture électronique en Tunisie.",
    "Centralisez, organisez et avancez sereinement vers la conformité TTN.",
    "Moins de complexité, plus de contrôle : FactureTN simplifie votre quotidien.",
    "La facture électronique devient simple : FactureTN vous accompagne étape par étape.",
  ];
  const positiveMsg = dailyPositive[dayIndex % dailyPositive.length];

  const welcomeName =
    (profile.full_name && profile.full_name.trim()) ||
    (profile.email ? profile.email.split("@")[0] : "Bienvenue");

  // ✅ CABINET pending : page spéciale, pas d’équipe/invitations pour le moment
  if (accountType === "cabinet" && profile.accountant_status === "pending") {
    const pendingUntil = formatDateFR(profile.accountant_pending_until);

    return (
      <AppShell
        title="Validation Cabinet"
        subtitle={`Bienvenue ${welcomeName} — votre compte cabinet est créé, validation en cours.`}
        accountType={accountType as any}
      >
        <div className="ftn-grid">
          <div className="ftn-grid-3">
            <Card title="Statut" subtitle="Vérification en attente">
              <div className="ftn-muted">
                Statut actuel : <b className="ftn-strong">pending</b>
              </div>

              <div className="ftn-muted mt-3">
                Délai maximum : <b className="ftn-strong">2 mois</b>
                {pendingUntil ? (
                  <>
                    {" "}
                    — Date limite : <b className="ftn-strong">{pendingUntil}</b>
                  </>
                ) : null}
              </div>

              <div className="ftn-alert mt-4" style={{ background: "rgba(245,158,11,.10)", borderColor: "rgba(245,158,11,.25)", color: "rgba(120,53,15,.95)" }}>
                Service gratuit pour les comptables, sous réserve de validation du statut professionnel
              </div>
            </Card>

            <Card title="Informations cabinet" subtitle="Données envoyées">
              <div className="ftn-muted">
                <div>
                  <span className="ftn-strong">MF :</span> {profile.accountant_mf || "—"}
                </div>
                <div className="mt-2">
                  <span className="ftn-strong">Patente :</span> {profile.accountant_patente || "—"}
                </div>
              </div>

              <div className="ftn-muted mt-3">
                Une fois validé, vous pourrez créer <b className="ftn-strong">1 société cabinet</b> (accès gratuit)
                et gérer vos clients.
              </div>
            </Card>

            <Card title="Message du jour" subtitle="Confiance & simplicité">
              <div className="ftn-muted">{positiveMsg}</div>
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Besoin d’aide ?" subtitle="Support">
              <div className="ftn-muted">
                Si vous voulez accélérer la vérification ou modifier MF/Patente, contactez notre support.
              </div>
              <div className="mt-4 flex gap-2 flex-wrap">
                <Link href="/help" className="ftn-btn">
                  Contacter le support
                </Link>
                <Link href="/account" className="ftn-btn-ghost">
                  Modifier mes informations
                </Link>
              </div>

              <div className="ftn-muted mt-4">
                Plan : <b className="ftn-strong">{profile.plan_code}</b> • Max sociétés :{" "}
                <b className="ftn-strong">{profile.max_companies}</b>
              </div>
            </Card>
          </div>
        </div>
      </AppShell>
    );
  }

  // ✅ Dashboard normal (client/groupe/cabinet verified)
  return (
    <AppShell
      title="Bienvenue"
      subtitle={`Bienvenue ${welcomeName} — ce projet est conçu pour faciliter la facture électronique TTN.`}
      accountType={accountType as any}
    >
      <div className="ftn-grid">
        {/* 3 cartes (clean) */}
        <div className="ftn-grid-3">
          <Card title="Facture électronique TTN" subtitle="Solution clé en main">
            <div className="ftn-muted">
              Génération <b className="ftn-strong">XML/PDF</b>, organisation & préparation à la conformité TTN.
            </div>
            <div className="mt-4">
              <Link href="/ttn" className="ftn-btn-success">
                Accès paramètres TTN
              </Link>
            </div>
          </Card>

          <Card title="Comment ça marche" subtitle="Simple & clair">
            <div className="ftn-muted">
              1) Créez vos factures
              <br />
              2) Elles sont structurées pour la facture électronique
              <br />
              3) Envoi TTN activé en production
            </div>
          </Card>

          <Card title="Message du jour" subtitle="Confiance & simplicité">
            <div className="ftn-muted">{positiveMsg}</div>
          </Card>
        </div>

        {/* Modules Premium (Soon) */}
        <div className="mt-6">
          <Card title="Modules Premium" subtitle="Bientôt disponibles (SOON)">
            <div className="ftn-muted">
              <ul className="list-disc pl-5 leading-7">
                <li>
                  <b>Envoi TTN programmé</b> (date/heure + rappel avant envoi)
                </li>
                <li>
                  <b>Notifications intelligentes</b> (accepté/rejeté + suivi)
                </li>
                <li>
                  <b>Statistiques visuelles</b> (graphiques + exports)
                </li>
                <li>
                  <b>API</b> (intégrations avancées)
                </li>
              </ul>
              <div className="ftn-muted mt-3">
                Si vous souhaitez être parmi les premiers, contactez notre support.
              </div>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              <Link href="/help" className="ftn-btn ftn-btn-soft">
                Contacter le support
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
