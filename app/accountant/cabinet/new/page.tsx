import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function NewCabinetPage() {
  const supabase = await createClient();

  // Auth
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  // Profile
  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();

  if (!profile || profile.account_type !== "comptable") {
    redirect("/dashboard");
  }

  async function createCabinet(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    const company_name = String(formData.get("company_name") || "").trim();
    const tax_id = String(formData.get("tax_id") || "").trim();
    const address = String(formData.get("address") || "").trim();
    const vat_rate_raw = String(formData.get("vat_rate") || "").trim();
    const stamp_duty_raw = String(formData.get("stamp_duty") || "").trim();

    if (!company_name || !tax_id) {
      redirect("/accountant/cabinet/new?err=missing");
    }

    const vat_rate = vat_rate_raw ? Number(vat_rate_raw) : null;
    const stamp_duty = stamp_duty_raw ? Number(stamp_duty_raw) : null;

    // NOTE: return the created company id so we can show a success page.
    const { data, error } = await supabase
      .from("companies")
      .insert({
        owner_user: auth.user.id,
        company_name,
        tax_id,
        address: address || null,
        vat_rate,
        stamp_duty,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      redirect("/accountant/cabinet/new?err=db");
    }

    redirect(`/accountant/cabinet/success?id=${data.id}`);
  }

  return (
    <AppShell
      title="Créer votre cabinet"
      subtitle="Créez la société principale de votre cabinet comptable."
      accountType="comptable"
    >
      <div className="ftn-grid">
        <div className="ftn-card">
          <h2 className="ftn-h2" style={{ marginTop: 0 }}>
            Informations du cabinet
          </h2>
          <p className="ftn-muted">
            Veuillez renseigner les informations de base. Le matricule fiscal est obligatoire.
            Vous pourrez modifier ces données plus tard.
          </p>

          <form action={createCabinet} className="ftn-grid" style={{ marginTop: 14 }}>
            <div>
              <label className="ftn-label">Nom du cabinet *</label>
              <input
                className="ftn-input"
                name="company_name"
                placeholder="Ex : Cabinet Sana"
                required
              />
            </div>

            <div>
              <label className="ftn-label">Matricule fiscal (MF) *</label>
              <input
                className="ftn-input"
                name="tax_id"
                placeholder="Ex : 1234567/A"
                required
              />
            </div>

            <div>
              <label className="ftn-label">Adresse</label>
              <input className="ftn-input" name="address" placeholder="Ex : Tunis, Ariana..." />
            </div>

            <div
              className="ftn-grid"
              style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}
            >
              <div>
                <label className="ftn-label">TVA (%)</label>
                <input className="ftn-input" name="vat_rate" type="number" step="0.01" placeholder="Ex : 19" />
              </div>

              <div>
                <label className="ftn-label">Timbre (TND)</label>
                <input className="ftn-input" name="stamp_duty" type="number" step="0.001" placeholder="Ex : 1.000" />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="ftn-btn" type="submit">
                Créer le cabinet
              </button>
              <a className="ftn-btn ftn-btn-ghost" href="/dashboard">
                Annuler
              </a>
            </div>
          </form>
        </div>

        <div className="ftn-card">
          <h3 className="ftn-h3" style={{ marginTop: 0 }}>
            Conseils
          </h3>
          <ul className="ftn-list">
            <li>Le matricule fiscal est indispensable pour la conformité.</li>
            <li>La TVA et le timbre peuvent être renseignés plus tard.</li>
            <li>Après création, vous pourrez configurer la connexion TTN.</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
