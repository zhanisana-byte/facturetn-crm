import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

type ProfileRow = {
  account_type: "client" | "cabinet" | "groupe" | null;
  plan_code: string | null;
  max_companies: number | null;
  subscription_ends_at: string | null;
  trial_ends_at: string | null;
  subscription_status:
    | "trial"
    | "active"
    | "pending_payment"
    | "expired"
    | "suspended"
    | "free_admin"
    | null;

  // ✅ champs validation comptable (selon ton schéma)
  accountant_mf: string | null;
  accountant_patente: string | null;
  accountant_status: "pending" | "verified" | "rejected" | null;
  accountant_verified_at: string | null;
  accountant_pending_until: string | null;
  accountant_free_access: boolean | null;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function statusBadge(status?: string | null) {
  if (status === "verified") {
    return { label: "Vérifié", cls: "border-emerald-200 bg-emerald-50 text-emerald-800" };
  }
  if (status === "rejected") {
    return { label: "Rejeté", cls: "border-rose-200 bg-rose-50 text-rose-800" };
  }
  return { label: "En vérification", cls: "border-amber-200 bg-amber-50 text-amber-900" };
}

// ✅ Server Action : envoi MF + Patente
async function submitVerification(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const accountant_mf = String(formData.get("accountant_mf") ?? "").trim();
  const accountant_patente = String(formData.get("accountant_patente") ?? "").trim();

  if (!accountant_mf || !accountant_patente) {
    // Next n'a pas "toast" server-side ici : on redirige avec query
    redirect("/accountant/cabinet?err=missing");
  }

  const pendingUntil = new Date();
  pendingUntil.setMonth(pendingUntil.getMonth() + 2);

  const { error } = await supabase
    .from("app_users")
    .update({
      accountant_mf,
      accountant_patente,
      accountant_status: "pending",
      accountant_verified_at: null,
      accountant_pending_until: pendingUntil.toISOString(),
      accountant_free_access: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.user.id);

  if (error) {
    redirect("/accountant/cabinet?err=save");
  }

  revalidatePath("/accountant/cabinet");
  redirect("/accountant/cabinet?ok=1");
}

export default async function Page({
  searchParams,
}: {
  searchParams?: { ok?: string; err?: string };
}) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const userId = auth.user.id;

  const { data: profile } = await supabase
    .from("app_users")
    .select(
      "account_type,plan_code,max_companies,subscription_ends_at,trial_ends_at,subscription_status,accountant_mf,accountant_patente,accountant_status,accountant_verified_at,accountant_pending_until,accountant_free_access"
    )
    .eq("id", userId)
    .maybeSingle();

  const p = (profile as ProfileRow | null) ?? null;
  const accountType = (p?.account_type as any) || undefined;

  // Cabinet = 1ère société du comptable (owner_user = user)
  const { data: cabinetList } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,address,vat_rate,stamp_duty,created_at")
    .eq("owner_user", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinet = (cabinetList?.[0] as CompanyRow | undefined) ?? undefined;

  if (!cabinet) {
    redirect("/accountant/cabinet/new");
  }

  const endsAt = p?.subscription_ends_at ? new Date(p.subscription_ends_at) : null;
  const trialEnds = p?.trial_ends_at ? new Date(p.trial_ends_at) : null;

  const badge = statusBadge(p?.accountant_status);

  const showOk = searchParams?.ok === "1";
  const err = searchParams?.err;

  return (
    <AppShell
      title="Mon cabinet"
      subtitle="Gérez votre cabinet, vos paramètres fiscaux et la connexion TTN."
      accountType={accountType}
    >
      <div className="ftn-grid">
        {/* ✅ Alertes */}
        {showOk && (
          <div className="ftn-card" style={{ borderColor: "rgba(16,185,129,.35)" }}>
            <b>✅ Demande envoyée.</b> Vos informations sont en cours de vérification.
          </div>
        )}
        {err === "missing" && (
          <div className="ftn-card" style={{ borderColor: "rgba(244,63,94,.35)" }}>
            <b>⚠️ MF et Patente sont obligatoires.</b>
          </div>
        )}
        {err === "save" && (
          <div className="ftn-card" style={{ borderColor: "rgba(244,63,94,.35)" }}>
            <b>⚠️ Erreur serveur.</b> Réessayez.
          </div>
        )}

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
              {/* ⚠️ adapte si ton TTN est /accountant/ttn */}
              <Link className="ftn-btn" href="/ttn">
                Paramètres TTN
              </Link>
              <Link className="ftn-btn ftn-btn-ghost" href="/accountant/cabinet/edit">
                Modifier
              </Link>
              <Link className="ftn-btn ftn-btn-ghost" href="/accountant/invoices">
                Factures
              </Link>
              {/* ⚠️ adapte si ton recurring route est comptable */}
              <Link className="ftn-btn ftn-btn-ghost" href="/accountant/recurring">
                Factures récurrentes
              </Link>
              <Link className="ftn-btn ftn-btn-ghost" href="/accountant/team">
                Mon équipe
              </Link>
            </div>
          </div>
        </div>

        {/* ✅ Vérification cabinet (MF / Patente) */}
        <div className="ftn-card" style={{ overflow: "visible" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="ftn-h3" style={{ marginTop: 0 }}>
              Vérification du cabinet
            </h3>

            <span className={`px-3 py-1 rounded-full border text-sm ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Après validation : bonus <b>“Accès gratuit Cabinet”</b> + gestion des accès / invitations.
          </div>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Délai de traitement : <b>jusqu’à 2 mois</b> — date indicative :{" "}
            <b>{fmtDate(p?.accountant_pending_until)}</b>
          </div>

          <div className="ftn-muted" style={{ marginTop: 10 }}>
            <b>Important :</b> ce délai est un délai administratif maximum (pas une durée d’accès gratuit).
          </div>

          <form action={submitVerification} style={{ marginTop: 14 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <div>
                <div className="ftn-muted" style={{ marginBottom: 6 }}>
                  MF (Matricule fiscal)
                </div>
                <input
                  name="accountant_mf"
                  defaultValue={p?.accountant_mf ?? ""}
                  placeholder="Ex: 1492904/A"
                  className="ftn-input"
                />
              </div>

              <div>
                <div className="ftn-muted" style={{ marginBottom: 6 }}>
                  Patente
                </div>
                <input
                  name="accountant_patente"
                  defaultValue={p?.accountant_patente ?? ""}
                  placeholder="Numéro patente"
                  className="ftn-input"
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="ftn-btn" type="submit">
                Envoyer pour validation
              </button>

              {p?.accountant_status === "verified" && (
                <span className="ftn-muted">
                  Vérifié le : <b>{fmtDate(p?.accountant_verified_at)}</b>
                </span>
              )}
            </div>
          </form>
        </div>

        {/* Abonnement */}
        <div className="ftn-card">
          <h3 className="ftn-h3" style={{ marginTop: 0 }}>
            Abonnement & accès
          </h3>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Plan: <b>{p?.plan_code || "—"}</b> · Nombre max de sociétés: <b>{p?.max_companies ?? "—"}</b>
          </div>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Essai jusqu’au: <b>{fmtDate(p?.trial_ends_at)}</b> · Fin d’abonnement:{" "}
            <b>{fmtDate(p?.subscription_ends_at)}</b>
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
