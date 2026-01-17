import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import InvoicesClient from "./InvoicesClient";
import CompanySelectClient from "./CompanySelectClient";
import { ensureWorkspaceRow, shellTypeFromWorkspace, type ActiveMode } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanyPick = {
  id: string;
  name: string;
  role: string;
  canCreateInvoices: boolean;
};

export default async function InvoicesPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase);
  // ✅ Facturation = uniquement via PROFIL (sidebar Profil)
  // On garde le mode "profil" même si une société est active.
  const mode: ActiveMode = "profil" as ActiveMode;
  const companyId = ws?.active_company_id ?? null;

  // Server action: activate company context
  async function activateCompany(nextCompanyId: string) {
    "use server";
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    // ✅ Conserver le mode PROFIL, mais activer le contexte société pour la facturation.
    await supabase
      .from("user_workspace")
      .upsert(
        {
          user_id: auth.user.id,
          active_mode: "profil",
          active_company_id: nextCompanyId,
          active_group_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  }

  // If no active company => show selector (NO /switch redirect)
  if (!companyId) {
    const { data: memberships } = await supabase
      .from("memberships")
      .select("company_id, role, can_create_invoices, is_active, companies(id, company_name)")
      .eq("user_id", auth.user.id)
      .eq("is_active", true);

    const companies: CompanyPick[] =
      (memberships ?? [])
        .map((m: any) => {
          const c = m?.companies;
          if (!c?.id) return null;
          return {
            id: String(c.id),
            name: String(c.company_name ?? "Société"),
            role: String(m.role ?? "viewer"),
            canCreateInvoices: Boolean(m.can_create_invoices),
          };
        })
        .filter(Boolean) as any;

    return (
      <AppShell title="Factures" subtitle="Sélectionnez une société" accountType={shellTypeFromWorkspace(mode)} activeCompanyId={null}>
        <div className="mx-auto w-full max-w-6xl p-6">
          <CompanySelectClient companies={companies} activateCompany={activateCompany} />
        </div>
      </AppShell>
    );
  }

  // Security: allow OWNER OR can_create_invoices
  const { data: m } = await supabase
    .from("memberships")
    .select("role,can_create_invoices,is_active")
    .eq("user_id", auth.user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  const isAllowed = Boolean(m?.is_active) && (m?.role === "owner" || m?.can_create_invoices);

  // If company active but user lost rights => show selector instead of /switch
  if (!isAllowed) {
    const { data: memberships } = await supabase
      .from("memberships")
      .select("company_id, role, can_create_invoices, is_active, companies(id, company_name)")
      .eq("user_id", auth.user.id)
      .eq("is_active", true);

    const companies: CompanyPick[] =
      (memberships ?? [])
        .map((mm: any) => {
          const c = mm?.companies;
          if (!c?.id) return null;
          return {
            id: String(c.id),
            name: String(c.company_name ?? "Société"),
            role: String(mm.role ?? "viewer"),
            canCreateInvoices: Boolean(mm.can_create_invoices),
          };
        })
        .filter(Boolean) as any;

    return (
      <AppShell title="Factures" subtitle="Sélectionnez une société" accountType={shellTypeFromWorkspace(mode)} activeCompanyId={null}>
        <div className="mx-auto w-full max-w-6xl p-6">
          <CompanySelectClient
            companies={companies}
            activateCompany={activateCompany}
            message="Vous n’avez plus accès à la société active. Sélectionnez une autre société."
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Factures" subtitle="Facturation" accountType={shellTypeFromWorkspace(mode)} activeCompanyId={companyId}>
      <div className="mx-auto w-full max-w-6xl p-6">
        <InvoicesClient companyId={companyId} />
      </div>
    </AppShell>
  );
}
