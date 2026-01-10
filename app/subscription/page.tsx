import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";

function fmt(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("fr-FR");
}

function toneFromStatus(status?: string | null) {
  const s = String(status || "").toLowerCase();
  if (s.includes("active")) return "tone-ok";
  if (s.includes("trial")) return "tone-info";
  if (s.includes("exp")) return "tone-bad";
  if (s.includes("susp")) return "tone-warn";
  return "tone-info";
}

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("app_users")
    .select(
      "id,email,full_name,account_type,max_companies,subscription_status,trial_ends_at,subscription_ends_at,created_at"
    )
    .eq("id", auth.user.id)
    .single();

  if (error || !profile) {
    return (
      <AppShell title="Abonnement" subtitle="" accountType={undefined}>
        <div className="ftn-alert">{error?.message || "Profil introuvable."}</div>
      </AppShell>
    );
  }

  if (!profile.account_type) redirect("/onboarding");

  const statusTone = toneFromStatus(profile.subscription_status);

  return (
    <AppShell
      title="Abonnement"
      subtitle="Type de compte & statut"
      accountType={profile.account_type as any}
    >
      <div className="ftn-grid">
        {/* TOP: type compte + abonnement (au lieu TTN) */}
        <div className="ftn-sub-grid">
          <div className="ftn-card">
            <div className="ftn-kpi-title">Type de compte</div>
            <div className="ftn-kpi-value capitalize">{profile.account_type}</div>
            <div className="ftn-muted mt-2">
              Inscription : <b className="ftn-strong">{fmt(profile.created_at)}</b>
              <br />
              Max sociétés : <b className="ftn-strong">{profile.max_companies ?? 1}</b>
            </div>
          </div>

          <div className="ftn-card">
            <div className="ftn-kpi-title">Abonnement</div>
            <div className="ftn-kpi-value capitalize">
              {profile.subscription_status || "trial"}
            </div>
            <div className={`ftn-badge ${statusTone}`}>
              Statut : {profile.subscription_status || "trial"}
            </div>

            <div className="ftn-muted mt-3">
              Fin essai : <b className="ftn-strong">{fmt(profile.trial_ends_at)}</b>
              <br />
              Fin abonnement : <b className="ftn-strong">{fmt(profile.subscription_ends_at)}</b>
            </div>
          </div>

          <div className="ftn-card">
            <div className="ftn-kpi-title">Accès</div>
            <div className="ftn-kpi-value">Inclus</div>
            <div className="ftn-muted mt-2">
              Factures XML/PDF + préparation facture électronique TTN.
              <br />
              (Envoi API TTN activé en production)
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              <Link href="/subscription" className="ftn-btn">
                Renouveler / Gérer
              </Link>
              <Link href="/ttn" className="ftn-btn-ghost">
                Paramètres TTN
              </Link>
            </div>
          </div>
        </div>

        {/* OFFRES */}
        <Card title="Offres" subtitle="Choisissez l’offre adaptée à votre activité">
          <div className="ftn-offer-grid">
            <div className="ftn-offer">
              <div className="ftn-offer-head">
                <div className="ftn-offer-title">Client simple</div>
                <span className="ftn-badge tone-info">1 société</span>
              </div>
              <div className="ftn-muted mt-2">
                Idéal pour une seule activité, facturation simple, préparation TTN.
              </div>
            </div>

            <div className="ftn-offer">
              <div className="ftn-offer-head">
                <div className="ftn-offer-title">Groupe / Multi-sociétés</div>
                <span className="ftn-badge tone-ok">illimité</span>
              </div>
              <div className="ftn-muted mt-2">
                Plusieurs sociétés, équipe, centralisation et organisation avancée.
              </div>
            </div>

            <div className="ftn-offer">
              <div className="ftn-offer-head">
                <div className="ftn-offer-title">Cabinet comptable</div>
                <span className="ftn-badge tone-ok">multi-clients</span>
              </div>
              <div className="ftn-muted mt-2">
                Gestion multi-clients + permissions + suivi structuré.
              </div>
            </div>
          </div>
        </Card>

        {/* SERVICES SUP */}
        <Card title="Services supplémentaires" subtitle="Optionnels (sur demande)">
          <div className="ftn-service-grid">
            <div className="ftn-service">
              <div className="ftn-service-title">Assistante facturation</div>
              <div className="ftn-muted mt-2">
                Notre équipe peut créer/organiser vos factures si vous manquez de temps.
              </div>
            </div>

            <div className="ftn-service">
              <div className="ftn-service-title">Support technique prioritaire</div>
              <div className="ftn-muted mt-2">
                Assistance rapide en cas de bug, blocage ou besoin urgent.
              </div>
            </div>

            <div className="ftn-service">
              <div className="ftn-service-title">Demandes sur mesure</div>
              <div className="ftn-muted mt-2">
                Adaptations spécifiques (workflow, exports, champs personnalisés, etc.).
              </div>
            </div>
          </div>

          <div className="mt-4 ftn-callout">
            <div className="ftn-callout-title">Besoin d’un service ?</div>
            <div className="ftn-muted mt-1">
              Contactez-nous et on vous propose la meilleure option.
            </div>
            <div className="ftn-callout-actions">
              <a className="ftn-btn-ghost" href="mailto:support@facturetn.tn">
                Email support
              </a>
              <Link className="ftn-btn" href="/support">
                Ouvrir une demande
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
