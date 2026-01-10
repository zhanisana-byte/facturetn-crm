import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

export default async function AccountantProfilePage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select(
      "id,email,full_name,account_type,accountant_status,accountant_mf,accountant_patente,accountant_free_access,accountant_pending_until"
    )
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile?.account_type) redirect("/onboarding");

  // ✅ sécurité: page profil comptable uniquement
  if (profile.account_type !== "cabinet") redirect("/dashboard");

  return (
    <AppShell
      title="Profil comptable"
      subtitle="Informations cabinet + statut de validation"
      accountType="cabinet"
    >
      <div className="ftn-grid">
        <div className="ftn-card">
          <div className="ftn-strong" style={{ fontSize: 16 }}>
            {profile.full_name || "—"}
          </div>
          <div className="ftn-muted" style={{ marginTop: 6 }}>
            {profile.email}
          </div>

          <div style={{ height: 14 }} />

          <div className="ftn-callout">
            <div className="ftn-callout-title">Statut</div>
            <div className="ftn-muted" style={{ marginTop: 6 }}>
              Statut cabinet : <b>{profile.accountant_status}</b>
              <br />
              Bonus gratuit : <b>{profile.accountant_free_access ? "actif" : "inactif"}</b>
              <br />
              Pending until : <b>{profile.accountant_pending_until ? new Date(profile.accountant_pending_until).toLocaleDateString("fr-FR") : "—"}</b>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div className="ftn-grid" style={{ gap: 10 }}>
            <div className="ftn-callout">
              <div className="ftn-callout-title">MF</div>
              <div className="ftn-muted" style={{ marginTop: 6 }}>
                <b>{profile.accountant_mf || "—"}</b>
              </div>
            </div>

            <div className="ftn-callout">
              <div className="ftn-callout-title">Patente</div>
              <div className="ftn-muted" style={{ marginTop: 6 }}>
                <b>{profile.accountant_patente || "—"}</b>
              </div>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="ftn-btn" href="/accountant/cabinet">
              Modifier infos cabinet
            </Link>
            <Link className="ftn-btn-ghost" href="/recap">
              Voir Récap
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
