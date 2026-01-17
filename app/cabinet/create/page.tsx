import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function CabinetCreateFromProfilPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

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

    if (!company_name || !tax_id) redirect("/cabinet/create?err=missing");

    const vat_rate = vat_rate_raw ? Number(vat_rate_raw) : null;
    const stamp_duty = stamp_duty_raw ? Number(stamp_duty_raw) : null;

    // 1) Créer la company (cabinet)
    const { data, error } = await supabase
      .from("companies")
      .insert({
        owner_user_id: auth.user.id,
        company_name,
        tax_id,
        address: address || null,
        vat_rate,
        stamp_duty,
      })
      .select("id")
      .single();

    if (error || !data?.id) redirect("/cabinet/create?err=db");

    const companyId = String(data.id);

    // 2) Créer membership owner
    await supabase.from("memberships").insert({
      user_id: auth.user.id,
      company_id: companyId,
      role: "owner",
      is_active: true,
    });

    // ✅ 3) IMPORTANT : donner accès Cabinet à l’utilisateur
    // (sinon /accountant/cabinet va te jeter)
    await supabase
      .from("app_users")
      .update({
        account_type: "cabinet",
        accountant_free_access: true,
        accountant_status: "verified",
        accountant_verified_at: new Date().toISOString(),
      })
      .eq("id", auth.user.id);

    redirect(`/accountant/cabinet/success?id=${companyId}`);
  }

  return (
    <AppShell title="Créer un cabinet" subtitle="Depuis Profil" accountType="profil">
      <div className="mx-auto w-full max-w-2xl p-6">
        <div className="ftn-card">
          <h2 className="ftn-h2" style={{ marginTop: 0 }}>
            Informations du cabinet
          </h2>

          <form action={createCabinet} className="ftn-grid" style={{ marginTop: 14 }}>
            <div>
              <label className="ftn-label">Nom du cabinet *</label>
              <input className="ftn-input" name="company_name" required />
            </div>

            <div>
              <label className="ftn-label">Matricule fiscal (MF) *</label>
              <input className="ftn-input" name="tax_id" required />
            </div>

            <div>
              <label className="ftn-label">Adresse</label>
              <input className="ftn-input" name="address" />
            </div>

            <div className="ftn-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <div>
                <label className="ftn-label">TVA (%)</label>
                <input className="ftn-input" name="vat_rate" type="number" step="0.01" />
              </div>
              <div>
                <label className="ftn-label">Timbre (TND)</label>
                <input className="ftn-input" name="stamp_duty" type="number" step="0.001" />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="ftn-btn" type="submit">Créer le cabinet</button>
              <a className="ftn-btn ftn-btn-ghost" href="/pages/new">Annuler</a>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
