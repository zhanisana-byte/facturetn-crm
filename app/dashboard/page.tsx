import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function Card({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "warn" | "info" | "ok";
}) {
  const badgeClass =
    tone === "warn"
      ? "ftn-badge tone-warn"
      : tone === "ok"
      ? "ftn-badge tone-ok"
      : "ftn-badge tone-info";

  const badgeText =
    tone === "warn" ? "En attente" : tone === "ok" ? "Actif" : "Info";

  return (
    <div className="ftn-card">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
        <span className={badgeClass}>{badgeText}</span>
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // Auth
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/login");

  // Profile
  const { data: profile, error: pErr } = await supabase
    .from("app_users")
    .select(
      "id,email,full_name,account_type,accountant_status,accountant_mf,accountant_patente,accountant_free_access,max_companies,plan_code,subscription_status"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (pErr || !profile) {
    // profil manquant => renvoyer vers login ou page erreur
    return (
      <div className="ftn-shell">
        <div className="ftn-auth">
          <div className="ftn-auth-card">
            <h1 className="ftn-auth-title">Erreur profil</h1>
            <p className="ftn-muted" style={{ marginTop: 8 }}>
              Impossible de charger votre profil (app_users). Vérifiez que l’inscription a bien créé l’entrée.
            </p>
            <div style={{ marginTop: 14 }}>
              <Link className="ftn-btn" href="/login">
                Retour connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const accountType = profile.account_type as "client" | "cabinet" | "groupe";

  // ✅ CABINET PENDING: afficher un dashboard “Validation en cours”
  if (accountType === "cabinet" && profile.accountant_status === "pending") {
    return (
      <div className="ftn-shell">
        <div className="ftn-auth">
          <div className="ftn-auth-card" style={{ maxWidth: 980, width: "100%" }}>
            <h1 className="ftn-auth-title">Validation du cabinet</h1>
            <p className="ftn-auth-sub">
              Votre compte cabinet est créé, mais l’accès gratuit (1 société) nécessite une validation.
            </p>

            <div className="ftn-grid" style={{ marginTop: 14 }}>
              <Card title="Statut de vérification" tone="warn">
                <div className="ftn-muted">
                  Statut actuel : <b>pending</b>
                </div>

                <div style={{ marginTop: 12 }} className="ftn-callout">
                  <div className="ftn-callout-title">Informations envoyées</div>
                  <div className="ftn-muted" style={{ marginTop: 6 }}>
                    <div>
                      <span className="ftn-strong">MF :</span> {profile.accountant_mf || "—"}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <span className="ftn-strong">Patente :</span> {profile.accountant_patente || "—"}
                    </div>
                  </div>
                </div>

                <div className="ftn-muted" style={{ marginTop: 12 }}>
                  Pendant la validation, la création de société est bloquée.
                </div>
              </Card>

              <Card title="Que pouvez-vous faire maintenant ?" tone="info">
                <ul style={{ margin: 0, paddingLeft: 18 }} className="ftn-muted">
                  <li>Préparer votre modèle de facture (infos, TVA, timbre…).</li>
                  <li>Contacter le support pour accélérer la validation.</li>
                  <li>Une fois vérifié : créer la société cabinet + inviter équipe + clients.</li>
                </ul>

                <div className="ftn-callout-actions" style={{ marginTop: 14 }}>
                  <Link className="ftn-btn" href="/support">
                    Contacter le support
                  </Link>
                  <Link className="ftn-btn-ghost" href="/account">
                    Modifier mes informations
                  </Link>
                </div>
              </Card>
            </div>

            <div style={{ marginTop: 14 }} className="ftn-muted">
              Plan : <b>{profile.plan_code}</b> • Max sociétés : <b>{profile.max_companies}</b>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ si cabinet verified mais pas encore d’espace accountant route => redirection
  if (accountType === "cabinet") {
    redirect("/accountant/invoices");
  }

  // ✅ groupe
  if (accountType === "groupe") {
    redirect("/group");
  }

  // ✅ client (par défaut)
  redirect("/invoices");
}
