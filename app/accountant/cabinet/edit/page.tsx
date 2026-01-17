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
};

export default async function EditCabinetPage() {
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

  if (!profile || profile.account_type !== "comptable") redirect("/dashboard");

  // Cabinet
  const { data: cabinetList } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,address,vat_rate,stamp_duty")
    .eq("owner_user", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  const cabinet = (cabinetList?.[0] as CompanyRow | undefined) ?? undefined;
  if (!cabinet) redirect("/accountant/cabinet/new");

  async function saveCabinet(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    const cabinetId = String(formData.get("cabinet_id") || "").trim();
    if (!cabinetId) redirect("/accountant/cabinet/edit?err=missing_id");

    const company_name = String(formData.get("company_name") || "").trim();
    const tax_id = String(formData.get("tax_id") || "").trim();
    const address = String(formData.get("address") || "").trim();
    const vat_rate_raw = String(formData.get("vat_rate") || "").trim();
    const stamp_duty_raw = String(formData.get("stamp_duty") || "").trim();

    if (!company_name || !tax_id) {
      redirect("/accountant/cabinet/edit?err=missing");
    }

    const vat_rate = vat_rate_raw ? Number(vat_rate_raw) : null;
    const stamp_duty = stamp_duty_raw ? Number(stamp_duty_raw) : null;

    const { error } = await supabase
      .from("companies")
      .update({
        company_name,
        tax_id,
        address: address || null,
        vat_rate,
        stamp_duty,
      })
      .eq("id", cabinetId)
      .eq("owner_user", auth.user.id);

    if (error) {
      redirect("/accountant/cabinet/edit?err=db");
    }

    redirect("/accountant/cabinet");
  }

  return (
    <AppShell
      title="Modifier votre cabinet"
      subtitle="Mettez à jour vos informations fiscales et vos paramètres."
      accountType="comptable"
    >
      <div className="ftn-grid">
        <div className="ftn-card">
          <h2 className="ftn-h2" style={{ marginTop: 0 }}>
            Informations du cabinet
          </h2>
          <p className="ftn-muted">
            Veuillez vérifier vos informations. Elles seront utilisées pour vos factures et la conformité TTN.
          </p>

          <form action={saveCabinet} className="ftn-grid" style={{ marginTop: 14 }}>
            {/* ✅ important */}
            <input type="hidden" name="cabinet_id" value={cabinet.id} />

            <div>
              <label className="ftn-label">Nom du cabinet *</label>
              <input
                className="ftn-input"
                name="company_name"
                defaultValue={cabinet.company_name || ""}
                required
              />
            </div>

            <div>
              <label className="ftn-label">Matricule fiscal (MF) *</label>
              <input className="ftn-input" name="tax_id" defaultValue={cabinet.tax_id || ""} required />
            </div>

            <div>
              <label className="ftn-label">Adresse</label>
              <input className="ftn-input" name="address" defaultValue={cabinet.address || ""} />
            </div>

            <div
              className="ftn-grid"
              style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}
            >
              <div>
                <label className="ftn-label">TVA (%)</label>
                <input
                  className="ftn-input"
                  name="vat_rate"
                  type="number"
                  step="0.01"
                  defaultValue={cabinet.vat_rate ?? ""}
                />
              </div>

              <div>
                <label className="ftn-label">Timbre (TND)</label>
                <input
                  className="ftn-input"
                  name="stamp_duty"
                  type="number"
                  step="0.001"
                  defaultValue={cabinet.stamp_duty ?? ""}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="ftn-btn" type="submit">
                Enregistrer les modifications
              </button>
              <a className="ftn-btn ftn-btn-ghost" href="/accountant/cabinet">
                Retour
              </a>
            </div>
          </form>
        </div>

        <div className="ftn-card">
          <h3 className="ftn-h3" style={{ marginTop: 0 }}>
            Note
          </h3>
          <ul className="ftn-list">
            <li>Le MF doit être exact pour éviter tout rejet.</li>
            <li>Vous pourrez configurer TTN dans « Paramètres TTN ».</li>
            <li>Les changements impactent la génération des factures futures.</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
