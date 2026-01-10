import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type CompanyRow = {
  id: string;
  company_name: string | null;
  tax_id: string | null;
  address: string | null;
  vat_rate: number | null;
  stamp_duty: number | null;
  created_at?: string | null;
};

export default async function Page() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const userId = auth.user.id;

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type,plan_code,max_companies,subscription_ends_at,trial_ends_at,subscription_status")
    .eq("id", userId)
    .maybeSingle();

  const accountType = (profile?.account_type as any) || undefined;

  // Cabinet = 1ère société du comptable (owner_user = user)
  const { data: cabinetList } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,address,vat_rate,stamp_duty,created_at")
    .eq("owner_user", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinet = cabinetList?.[0] as CompanyRow | undefined;

  if (!cabinet) {
    redirect("/accountant/cabinet/new");
  }

  const endsAt = profile?.subscription_ends_at ? new Date(profile.subscription_ends_at) : null;
  const trialEnds = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;

  const fmt = (d: Date | null) =>
    d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—";

  return (
    <AppShell
      title="Mon cabinet"
      subtitle="Gérez votre cabinet, vos paramètres fiscaux et la connexion TTN."
      accountType={accountType}
    >
      <div className="ftn-grid">
        {/* Résumé cabinet */}
        <div className="ftn-card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="ftn-h2" style={{ marginTop: 0 }}>
                {cabinet.company_name || "Cabinet"}
              </h2>

              <div className="ftn-muted" style={{ marginTop: 6 }}>
                Matricule fiscal (MF): <b>{cabinet.tax_id || "—"}</b> · TVA:{" "}
                <b>{cabinet.vat_rate ?? "—"}</b>% · Timbre: <b>{cabinet.stamp_duty ?? "—"}</b> TND
              </div>

              <div className="ftn-muted" style={{ marginTop: 6 }}>
                Adresse: {cabinet.address || "—"}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Link className="ftn-btn" href="/ttn">
                Paramètres TTN
              </Link>
              <Link className="ftn-btn ftn-btn-ghost" href="/accountant/cabinet/edit">
                Modifier
              </Link>
              <Link className="ftn-btn ftn-btn-ghost" href="/accountant/invoices">
                Factures
              </Link>
              <Link className="ftn-btn ftn-btn-ghost" href="/recurring">
                Factures récurrentes
              </Link>
              <Link className="ftn-btn ftn-btn-ghost" href="/accountant/team">
                Mon équipe
              </Link>
            </div>
          </div>
        </div>

        {/* Abonnement */}
        <div className="ftn-card">
          <h3 className="ftn-h3" style={{ marginTop: 0 }}>
            Abonnement & accès
          </h3>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Plan: <b>{profile?.plan_code || "—"}</b> · Nombre max de sociétés:{" "}
            <b>{profile?.max_companies ?? "—"}</b>
          </div>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Essai jusqu’au: <b>{fmt(trialEnds)}</b> · Fin d’abonnement: <b>{fmt(endsAt)}</b>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="ftn-btn" href="/subscription">
              Voir mon abonnement
            </Link>
            <Link className="ftn-btn ftn-btn-ghost" href="/help">
              Aide & support
            </Link>
          </div>
        </div>

        {/* Conformité + Clôture (2 cartes فقط) */}
        <div className="ftn-grid-3" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
          <div className="ftn-card">
            <h3 className="ftn-h3" style={{ marginTop: 0 }}>
              Conformité TTN
            </h3>
            <p className="ftn-muted">
              Vos factures restent conformes (modèle standard). Vous pourrez exporter en PDF/XML et préparer l’envoi vers TTN.
            </p>
          </div>

          <div className="ftn-card">
            <h3 className="ftn-h3" style={{ marginTop: 0 }}>
              Clôture mensuelle
            </h3>
            <p className="ftn-muted">
              Vérifiez, validez et préparez votre déclaration du mois (audit et traçabilité).
            </p>
            <div style={{ marginTop: 12 }}>
              <Link className="ftn-btn ftn-btn-ghost" href="/accountant/declaration">
                Ouvrir la clôture
              </Link>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
