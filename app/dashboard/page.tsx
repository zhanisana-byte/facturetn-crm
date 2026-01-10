import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("app_users")
    .select("id,email,full_name,account_type")
    .eq("id", auth.user.id)
    .single();

  if (error || !profile) {
    return (
      <AppShell title="Dashboard" subtitle="" accountType={undefined}>
        <div className="ftn-alert">{error?.message || "Profil introuvable."}</div>
      </AppShell>
    );
  }

  if (!profile.account_type) redirect("/onboarding");

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

  return (
    <AppShell
      title="Bienvenue"
      subtitle={`Bienvenue ${welcomeName} — ce projet est conçu pour faciliter la facture électronique TTN.`}
      accountType={profile.account_type as any}
    >
      <div className="ftn-grid">
        {/* 2 cartes seulement (clean) */}
        <div className="ftn-grid-3">
          {/* Carte TTN / Facture électronique */}
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

          {/* Carte “Comment ça marche” */}
          <Card title="Comment ça marche" subtitle="Simple & clair">
            <div className="ftn-muted">
              1) Créez vos factures
              <br />
              2) Elles sont structurées pour la facture électronique
              <br />
              3) Envoi TTN activé en production
            </div>
          </Card>

          {/* Carte message positif */}
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
