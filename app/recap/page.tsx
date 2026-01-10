import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

type RecapItem = {
  company_id: string;
  company_name: string;
  role: string;
  can_create_invoices: boolean;
  can_validate_invoices: boolean;
  can_submit_ttn: boolean;
  can_manage_customers: boolean;
  is_active: boolean;
};

export default async function RecapPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id, full_name, email, account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!profile?.account_type) redirect("/onboarding");

  const { data: memberships } = await supabase
    .from("memberships")
    .select(
      `
      company_id,
      role,
      can_create_invoices,
      can_validate_invoices,
      can_submit_ttn,
      can_manage_customers,
      is_active,
      companies:company_id ( company_name )
    `
    )
    .eq("user_id", auth.user.id);

  const rows: RecapItem[] =
    memberships?.map((m: any) => ({
      company_id: m.company_id,
      company_name: m.companies?.company_name || "—",
      role: m.role,
      can_create_invoices: !!m.can_create_invoices,
      can_validate_invoices: !!m.can_validate_invoices,
      can_submit_ttn: !!m.can_submit_ttn,
      can_manage_customers: !!m.can_manage_customers,
      is_active: !!m.is_active,
    })) || [];

  return (
    <AppShell
      title="Récap"
      subtitle="Qui peut faire quoi ? (permissions & sociétés liées)"
      accountType={profile.account_type as any}
    >
      <div className="ftn-card">
        <div className="ftn-muted">
          Compte : <b>{profile.full_name || profile.email}</b> • Type :{" "}
          <b>{profile.account_type}</b>
        </div>

        <div style={{ height: 12 }} />

        {rows.length === 0 ? (
          <div className="ftn-alert">Aucune société liée pour le moment.</div>
        ) : (
          <table className="ftn-table">
            <thead>
              <tr>
                <th>Société</th>
                <th>Rôle</th>
                <th>Créer</th>
                <th>Valider</th>
                <th>TTN</th>
                <th>Clients</th>
                <th>Actif</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.company_id}>
                  <td>{r.company_name}</td>
                  <td>{r.role}</td>
                  <td>{r.can_create_invoices ? "✅" : "—"}</td>
                  <td>{r.can_validate_invoices ? "✅" : "—"}</td>
                  <td>{r.can_submit_ttn ? "✅" : "—"}</td>
                  <td>{r.can_manage_customers ? "✅" : "—"}</td>
                  <td>{r.is_active ? "✅" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ height: 14 }} />

        <div className="ftn-callout">
          <div className="ftn-callout-title">Info</div>
          <div className="ftn-muted" style={{ marginTop: 6 }}>
            “Récap” évite le mot <b>Accès</b> et résume clairement les permissions.
          </div>
        </div>
      </div>
    </AppShell>
  );
}
