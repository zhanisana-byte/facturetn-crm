// app/companies/[id]/page.tsx
import AppShell from "@/app/components/AppShell";
import CompanyDashboard from "./CompanyDashboard";
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id  } = await params;

  // routes réservées
  if (id === "new" || id === "create") {
    redirect("/companies/create");
  }

  if (!isUuid(id)) {
    notFound();
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // ✅ Authz safety: require membership (owner/admin/staff) - rely on RLS but keep UX clean
  const { data: membership } = await supabase
    .from("memberships")
    .select("id,role,is_active")
    .eq("company_id", id)
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership?.id) {
    return (
      <AppShell
        title="Société"
        subtitle="Accès refusé"
        accountType={shellTypeFromWorkspace("entreprise")}
        activeCompanyId={id}
      >
        <div className="ftn-alert">Tu n&apos;as pas accès à cette société.</div>
      </AppShell>
    );
  }

  // workspace actuel
  const ws = await ensureWorkspaceRow(supabase);

  /**
   * ✅ FIX CRITIQUE
   * On met à jour le workspace SI NÉCESSAIRE
   * ❌ SANS redirect derrière
   *
   * DB ActiveMode = profil | entreprise | comptable | multi_societe
   * => "societe" n'existe pas, on utilise "entreprise"
   */
  if (ws?.active_mode !== "entreprise" || ws?.active_company_id !== id) {
    try {
      await supabase.from("user_workspace").upsert(
        {
          user_id: auth.user.id,
          active_mode: "entreprise",
          active_company_id: id,
          active_group_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch {
      // ⚠️ on ignore toute erreur RLS
      // on laisse la page s'afficher quand même
    }
  }

  return (
    <AppShell
      title="Société"
      subtitle="Dashboard société (KPI) + TTN + droits d’accès"
      accountType={shellTypeFromWorkspace("entreprise")}
      activeCompanyId={id}
    >
      <CompanyDashboard companyId={id} />
    </AppShell>
  );
}
