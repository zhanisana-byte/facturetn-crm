import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Table, Badge } from "@/components/ui";

type SearchParamsShape = { company?: string };

export default async function AccountantRecurringPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>;
}) {
  const sp = (await searchParams) ?? {};

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type,subscription_status")
    .eq("id", auth.user.id)
    .single();

  const isOwner =
    profile?.account_type === "comptable" && profile?.subscription_status === "free_admin";

  let companyIds: string[] = [];
  if (isOwner) {
    const { data } = await supabase
      .from("memberships")
      .select("company_id")
      .eq("user_id", auth.user.id)
      .eq("is_active", true);

    companyIds = (data ?? [])
      .map((r: { company_id: string }) => r.company_id)
      .filter(Boolean);
  } else {
    const { data } = await supabase
      .from("client_assignments")
      .select("company_id")
      .eq("staff_user_id", auth.user.id)
      .eq("is_active", true);

    companyIds = (data ?? [])
      .map((r: { company_id: string }) => r.company_id)
      .filter(Boolean);
  }

  companyIds = Array.from(new Set(companyIds));

  const { data: companies } = companyIds.length
    ? await supabase
        .from("companies")
        .select("id,company_name")
        .in("id", companyIds)
        .order("company_name", { ascending: true })
    : ({ data: [] as Array<{ id: string; company_name: string | null }> });

  const selectedCompany =
    sp.company || (companies?.length === 1 ? companies[0].id : "");

  const { data: templates, error } = selectedCompany
    ? await supabase
        .from("recurring_invoice_templates")
        .select("id,label,frequency,next_run_date,is_active,customers(name)")
        .eq("company_id", selectedCompany)
        .order("created_at", { ascending: false })
    : ({ data: [] as any[], error: null as any });

  return (
    <AppShell
      title="Factures permanentes"
      subtitle={isOwner ? "Cabinet — modèles mensuels" : "Mes clients — modèles"}
      accountType={profile?.account_type as any}
    >
      <Card title="Sélection client" subtitle="Choisir une société cliente">
        {companies?.length ? (
          <div className="flex flex-wrap gap-2">
            {companies.map((c: { id: string; company_name: string | null }) => (
              <Link
                key={c.id}
                className={
                  "ftn-chip " + (selectedCompany === c.id ? "is-active" : "")
                }
                href={`/accountant/recurring?company=${c.id}`}
              >
                {c.company_name ?? "Société"}
              </Link>
            ))}
          </div>
        ) : (
          <div className="ftn-muted">Aucune société cliente disponible.</div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge>Total sociétés: {companies?.length ?? 0}</Badge>
          {selectedCompany ? <Badge>Choisie</Badge> : <Badge>Choisir une société</Badge>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="ftn-btn"
            href={
              selectedCompany
                ? `/recurring/new?company=${selectedCompany}`
                : "/accountant/clients"
            }
          >
            + Nouvelle facture permanente
          </Link>
          <Link className="ftn-btn ftn-btn-soft" href="/accountant/invoices">
            Tableau factures
          </Link>
        </div>
      </Card>

      <div className="mt-6">
        <Card title="Modèles" subtitle="Liste des templates (mensuel)">
          {error ? <div className="ftn-alert">{error.message}</div> : null}

          {!selectedCompany ? (
            <div className="ftn-muted">
              Sélectionnez une société pour voir ses modèles.
            </div>
          ) : (templates?.length ?? 0) === 0 ? (
            <div className="ftn-muted">Aucun modèle.</div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Libellé</th>
                  <th>Client</th>
                  <th>Fréquence</th>
                  <th>Prochaine</th>
                  <th>Statut</th>
                </tr>
              }
            >
              {(templates ?? []).map((tpl: any) => (
                <tr key={tpl.id}>
                  <td className="font-semibold">{tpl.label}</td>
                  <td>{tpl.customers?.name ?? "—"}</td>
                  <td>{tpl.frequency ?? "monthly"}</td>
                  <td>
                    {tpl.next_run_date
                      ? new Date(tpl.next_run_date).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    {tpl.is_active ? (
                      <span className="ftn-pill is-ok">active</span>
                    ) : (
                      <span className="ftn-pill is-warn">inactive</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
