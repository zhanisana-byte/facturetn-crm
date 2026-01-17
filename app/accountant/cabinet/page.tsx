import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function CabinetHomePage() {
  const supabase = await createClient();

  // ✅ rapide (cookie)
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  // ✅ vérifier type comptable/cabinet
  const { data: me } = await supabase
    .from("app_users")
    .select("id,account_type,full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  const acc = String(me?.account_type ?? "");
  if (!me || (acc !== "comptable" && acc !== "cabinet")) redirect("/dashboard");

  // ✅ obtenir la “company cabinet” la plus récente où je suis owner
  // (rapide : 1 query, pas de join)
  const { data: myCabinet } = await supabase
    .from("memberships")
    .select("company_id, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cabinetCompanyId = myCabinet?.company_id ?? null;

  // ✅ si pas encore de cabinet créé
  if (!cabinetCompanyId) {
    return (
      <AppShell title="Cabinet" subtitle="Espace Cabinet" accountType="comptable">
        <div className="ftn-card p-4">
          <div className="text-sm text-slate-700">
            Aucun cabinet trouvé pour le moment.
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <a className="ftn-btn" href="/accountant/cabinet/new">Créer mon cabinet</a>
            <a className="ftn-btn ftn-btn-ghost" href="/switch">Switch</a>
          </div>
        </div>
      </AppShell>
    );
  }

  // ✅ charger infos cabinet (1 query simple)
  const { data: company } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,created_at")
    .eq("id", cabinetCompanyId)
    .maybeSingle();

  return (
    <AppShell title="Cabinet" subtitle="Espace Cabinet" accountType="comptable">
      <div className="ftn-card p-4">
        <div className="font-semibold">{company?.company_name ?? "Mon cabinet"}</div>
        <div className="text-sm text-slate-600 mt-1">
          MF : <b>{company?.tax_id ?? "—"}</b>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          <a className="ftn-btn" href={`/companies/${cabinetCompanyId}/ttn`}>Paramètres TTN</a>
          <a className="ftn-btn" href={`/companies/edit/${cabinetCompanyId}`}>Mon cabinet</a>
          <a className="ftn-btn" href="/accountant/clients">Mes clients</a>
          <a className="ftn-btn ftn-btn-ghost" href="/switch">Switch</a>
        </div>

        <div className="mt-6 text-xs text-slate-500">
          Optimisation: cette page ne charge pas de listes lourdes (clients/invitations) pour rester rapide.
        </div>
      </div>
    </AppShell>
  );
}
