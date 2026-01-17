import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function CabinetPage() {
  const supabase = await createClient();

  // ✅ rapide (cookie-based)
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  // ✅ vérifier que c’est bien un compte cabinet / comptable
  const { data: me } = await supabase
    .from("app_users")
    .select("id, account_type, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!me || !["cabinet", "comptable"].includes(me.account_type)) {
    redirect("/dashboard");
  }

  // ✅ récupérer le cabinet (company) via memberships
  const { data: membership } = await supabase
    .from("memberships")
    .select("company_id, role")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 👉 pas encore de cabinet
  if (!membership?.company_id) {
    return (
      <AppShell title="Cabinet" subtitle="Espace Cabinet" accountType="comptable">
        <div className="ftn-card p-4">
          <p className="text-sm text-slate-600">
            Aucun cabinet n’est encore créé.
          </p>

          <div className="mt-4 flex gap-2">
            <Link className="ftn-btn" href="/accountant/cabinet/new" prefetch>
              Créer mon cabinet
            </Link>
            <Link className="ftn-btn ftn-btn-ghost" href="/switch" prefetch>
              Switch
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  // ✅ charger infos cabinet (1 requête simple)
  const { data: company, error: companyErr } = await supabase
    .from("companies")
    .select("id, company_name, tax_id")
    .eq("id", membership.company_id)
    .maybeSingle();

  // ✅ Fix build + sécurité runtime
  if (companyErr || !company?.id) {
    // Si membership existe mais company introuvable, on renvoie vers new
    redirect("/accountant/cabinet/new");
  }

  return (
    <AppShell
      title="Cabinet"
      subtitle="Espace Cabinet"
      accountType="comptable"
      activeCompanyId={company.id}
    >
      <div className="ftn-card p-4">
        <h3 className="font-semibold">{company.company_name}</h3>
        <p className="text-sm text-slate-600 mt-1">
          MF : <b>{company.tax_id ?? "—"}</b>
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="ftn-btn"
            href={`/accountant/cabinet/edit/${company.id}`}
            prefetch
          >
            Mon cabinet
          </Link>

          <Link
            className="ftn-btn"
            href={`/accountant/cabinet/ttn/${company.id}`}
            prefetch
          >
            Paramètres TTN
          </Link>

          <Link className="ftn-btn" href="/accountant/clients" prefetch>
            Mes clients
          </Link>

          <Link className="ftn-btn ftn-btn-ghost" href="/switch" prefetch>
            Switch
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
