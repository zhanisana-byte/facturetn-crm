import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import CompanySelectClient from "@/app/invoices/CompanySelectClient";
import { ensureWorkspaceRow, shellTypeFromWorkspace, type ActiveMode } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanyPick = {
  id: string;
  name: string;
  role: string;
  canCreateInvoices: boolean;
};

export default async function RecurringPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase);

  // ✅ La facturation (y compris récurrente) se fait via PROFIL.
  // On garde le mode "profil" mais on utilise le contexte société (active_company_id).
  const mode: ActiveMode = "profil" as ActiveMode;
  const companyId = ws?.active_company_id ?? null;

  async function activateCompany(nextCompanyId: string) {
    "use server";
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

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

  // 1) Si aucune société active => proposer la sélection via memberships (comme /invoices)
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
      <AppShell
        title="Factures permanentes"
        subtitle="Sélectionnez une société"
        accountType={shellTypeFromWorkspace(mode)}
        activeCompanyId={null}
      >
        <div className="mx-auto w-full max-w-6xl p-6">
          <CompanySelectClient companies={companies} activateCompany={activateCompany} />
        </div>
      </AppShell>
    );
  }

  // 2) Sécurité : OWNER OU can_create_invoices (même logique que /invoices)
  const { data: m } = await supabase
    .from("memberships")
    .select("role,can_create_invoices,is_active, companies(company_name)")
    .eq("user_id", auth.user.id)
    .eq("company_id", companyId)
    .maybeSingle();

  const isAllowed = Boolean(m?.is_active) && (m?.role === "owner" || m?.can_create_invoices);

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
      <AppShell
        title="Factures permanentes"
        subtitle="Sélectionnez une société"
        accountType={shellTypeFromWorkspace(mode)}
        activeCompanyId={null}
      >
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

  const activeCompanyName = String((m as any)?.companies?.company_name ?? "Société");

  // 3) Charger les templates récurrents pour la société active
  const { data } = await supabase
    .from("recurring_invoice_templates")
    .select(
      `
      id,
      label,
      frequency,
      next_run_date,
      is_active,
      customers ( name )
    `
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const templates = data ?? [];

  return (
    <AppShell
      title="Factures permanentes"
      subtitle="Création et gestion des factures mensuelles automatiques"
      accountType={shellTypeFromWorkspace(mode)}
      activeCompanyId={companyId}
    >
      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="text-sm text-gray-600">
            Société active : <span className="font-medium">{activeCompanyName}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Libellé</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Fréquence</th>
                <th className="px-4 py-3">Prochaine facture</th>
                <th className="px-4 py-3">Statut</th>
              </tr>
            </thead>

            <tbody>
              {templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    Aucune facture permanente.
                  </td>
                </tr>
              )}

              {templates.map((tpl: any) => (
                <tr key={tpl.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{tpl.label}</td>
                  <td className="px-4 py-3">{tpl.customers?.name ?? "-"}</td>
                  <td className="px-4 py-3 capitalize">{tpl.frequency}</td>
                  <td className="px-4 py-3">
                    {tpl.next_run_date ? new Date(tpl.next_run_date).toLocaleDateString() : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        tpl.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {tpl.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
