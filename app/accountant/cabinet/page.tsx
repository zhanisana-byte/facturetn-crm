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
  email: string | null;
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

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
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

/**
 * ✅ Server Action
 * - Enregistre MF + Patente dans app_users
 * - Met status = pending + pending_until = now + 2 mois
 * - Enregistre email du propriétaire du cabinet dans companies.email (obligatoire)
 */
async function submitVerification(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const accountant_mf = String(formData.get("accountant_mf") ?? "").trim();
  const accountant_patente = String(formData.get("accountant_patente") ?? "").trim();
  const owner_email = String(formData.get("owner_email") ?? "").trim().toLowerCase();
  const cabinet_id = String(formData.get("cabinet_id") ?? "").trim();

  if (!cabinet_id) redirect("/accountant/cabinet?err=cabinet");
  if (!accountant_mf || !accountant_patente) redirect("/accountant/cabinet?err=missing");
  if (!owner_email || !isValidEmail(owner_email)) redirect("/accountant/cabinet?err=email");

  // 2 mois (délai administratif max)
  const pendingUntil = new Date();
  pendingUntil.setMonth(pendingUntil.getMonth() + 2);

  // Update profil comptable
  const { error: upErr } = await supabase
    .from("app_users")
    .update({
      accountant_mf,
      accountant_patente,
      accountant_status: "pending",
      accountant_verified_at: null,
      accountant_pending_until: pendingUntil.toISOString(),
      accountant_free_access: true, // bonus accès cabinet pendant vérification (si tu veux)
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.user.id);

  if (upErr) redirect("/accountant/cabinet?err=save_profile");

  // Update email propriétaire sur la société cabinet (companies.email)
  const { error: coErr } = await supabase
    .from("companies")
    .update({ email: owner_email, updated_at: new Date().toISOString() })
    .eq("id", cabinet_id);

  if (coErr) redirect("/accountant/cabinet?err=save_company");

  revalidatePath("/accountant/cabinet");
  redirect("/accountant/cabinet?ok=1");
}

export default async function Page({
  searchParams,
}: {
  // ✅ FIX Next.js : searchParams est un Promise dans ton build
  searchParams?: Promise<{ ok?: string; err?: string }>;
}) {
  const sp = (await searchParams) ?? {};
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
    .select("id,company_name,tax_id,address,vat_rate,stamp_duty,email,created_at")
    .eq("owner_user", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinet = (cabinetList?.[0] as CompanyRow | undefined) ?? undefined;

  if (!cabinet) redirect("/accountant/cabinet/new");

  const badge = statusBadge(p?.accountant_status);

  return (
    <AppShell
      title="Mon cabinet"
      subtitle="Nom du cabinet + validation Patente (bonus accès gratuit) + accès TTN."
      accountType={accountType}
    >
      <div className="ftn-grid">
        {/* Alerts */}
        {sp?.ok === "1" && (
          <div className="ftn-card" style={{ borderColor: "rgba(16,185,129,.35)" }}>
            <b>✅ Demande envoyée.</b> Vos informations sont en cours de vérification.
          </div>
        )}
        {sp?.err === "missing" && (
          <div className="ftn-card" style={{ borderColor: "rgba(244,63,94,.35)" }}>
            <b>⚠️ MF et Patente sont obligatoires.</b>
          </div>
        )}
        {sp?.err === "email" && (
          <div className="ftn-card" style={{ borderColor: "rgba(244,63,94,.35)" }}>
            <b>⚠️ Email du propriétaire obligatoire.</b> Format invalide.
          </div>
        )}
        {sp?.err === "save_profile" && (
          <div className="ftn-card" style={{ borderColor: "rgba(244,63,94,.35)" }}>
            <b>⚠️ Erreur enregistrement profil.</b> Réessayez.
          </div>
        )}
        {sp?.err === "save_company" && (
          <div className="ftn-card" style={{ borderColor: "rgba(244,63,94,.35)" }}>
            <b>⚠️ Erreur enregistrement email cabinet.</b> Réessayez.
          </div>
        )}
        {sp?.err === "cabinet" && (
          <div className="ftn-card" style={{ borderColor: "rgba(244,63,94,.35)" }}>
            <b>⚠️ Cabinet introuvable.</b>
          </div>
        )}

        {/* Résumé cabinet (minimal) */}
        <div className="ftn-card">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="ftn-h2" style={{ marginTop: 0 }}>
                {cabinet.company_name || "Cabinet"}
              </h2>

              <div className="ftn-muted" style={{ marginTop: 6 }}>
                MF société: <b>{cabinet.tax_id || "—"}</b> · TVA: <b>{cabinet.vat_rate ?? "—"}</b>% · Timbre:{" "}
                <b>{cabinet.stamp_duty ?? "—"}</b> TND
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
            </div>
          </div>
        </div>

        {/* ✅ Validation Patente (simple + clair) */}
        <div className="ftn-card" style={{ overflow: "visible" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="ftn-h3" style={{ marginTop: 0 }}>
              Validation Patente (bonus accès gratuit)
            </h3>
            <span className={`px-3 py-1 rounded-full border text-sm ${badge.cls}`}>{badge.label}</span>
          </div>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Délai de traitement : <b>jusqu’à 2 mois</b> · Date indicative : <b>{fmtDate(p?.accountant_pending_until)}</b>
          </div>

          <form action={submitVerification} style={{ marginTop: 14 }}>
            <input type="hidden" name="cabinet_id" value={cabinet.id} />

            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              }}
            >
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

              <div>
                <div className="ftn-muted" style={{ marginBottom: 6 }}>
                  Email du propriétaire (obligatoire)
                </div>
                <input
                  name="owner_email"
                  defaultValue={cabinet.email ?? ""}
                  placeholder="ex: owner@cabinet.tn"
                  className="ftn-input"
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button className="ftn-btn" type="submit">
                Envoyer pour validation
              </button>

              {p?.accountant_status === "verified" && (
                <span className="ftn-muted">
                  Vérifié le : <b>{fmtDate(p?.accountant_verified_at)}</b>
                </span>
              )}

              <span className="ftn-muted">
                <b>Note :</b> le délai administratif n’est pas une durée d’accès gratuit.
              </span>
            </div>
          </form>
        </div>

        {/* Abonnement (petit bloc, pas chargé) */}
        <div className="ftn-card">
          <h3 className="ftn-h3" style={{ marginTop: 0 }}>
            Abonnement
          </h3>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Plan: <b>{p?.plan_code || "—"}</b> · Max sociétés: <b>{p?.max_companies ?? "—"}</b>
          </div>

          <div className="ftn-muted" style={{ marginTop: 8 }}>
            Essai: <b>{fmtDate(p?.trial_ends_at)}</b> · Fin: <b>{fmtDate(p?.subscription_ends_at)}</b>
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="ftn-btn" href="/subscription">
              Voir mon abonnement
            </Link>
            <Link className="ftn-btn ftn-btn-ghost" href="/help">
              Aide
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
