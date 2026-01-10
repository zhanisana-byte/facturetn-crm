import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Table, Badge } from "@/components/ui";

function isFilled(v: any) {
  return typeof v === "string" ? v.trim().length > 0 : !!v;
}

export default async function CompaniesPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Liste des sociétés où je suis membre (owner / staff / comptable)
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("company_id, role, companies(id, company_name, tax_id)")
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  if (error) {
    return (
      <AppShell title="Sociétés" subtitle="Gestion des sociétés" accountType={undefined}>
        <div className="ftn-alert">{error.message}</div>
      </AppShell>
    );
  }

  const rows =
    (memberships ?? [])
      .map((m: any) => ({
        id: m.companies?.id ?? m.company_id,
        name: m.companies?.company_name ?? "Société",
        taxId: m.companies?.tax_id ?? "—",
        role: m.role,
      }))
      .filter((r) => r.id) ?? [];

  // TTN readiness (optionnel)
  const ids = rows.map((r) => r.id);
  const { data: creds, error: ttnErr } = ids.length
    ? await supabase
        .from("ttn_credentials")
        .select("company_id,ttn_mode,connection_type,environment,cert_serial_number,cert_email")
        .in("company_id", ids)
    : ({ data: [] as any[], error: null } as any);

  const ttnByCompany = new Map<string, any>();
  (creds ?? []).forEach((c: any) => ttnByCompany.set(c.company_id, c));

  function ttnReady(companyId: string) {
    const c: any = ttnByCompany.get(companyId);
    if (!c) return false;
    return (
      isFilled(c.ttn_mode) &&
      isFilled(c.connection_type) &&
      isFilled(c.environment) &&
      isFilled(c.cert_serial_number) &&
      isFilled(c.cert_email)
    );
  }

  return (
    <AppShell title="Sociétés" subtitle="Créer et gérer les sociétés (MF)" accountType={undefined}>
      <Card
        title="Mes sociétés"
        subtitle="Accès via memberships (owner/staff/accountant/viewer)"
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <Badge>Total: {rows.length}</Badge>
          </div>
          <Link href="/companies/create" className="ftn-btn">
            + Créer société
          </Link>
        </div>

        <div className="mt-5">
          {ttnErr ? (
            <div className="ftn-alert mb-4">
              TTN non configuré côté base (SQL manquant) : {ttnErr.message}
            </div>
          ) : null}
          {rows.length === 0 ? (
            <div className="ftn-muted">Aucune société pour le moment. Clique sur “Créer société”.</div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Société</th>
                  <th>MF</th>
                  <th>Rôle</th>
                  <th>TTN</th>
                  <th></th>
                </tr>
              }
            >
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.name}</td>
                  <td>{r.taxId}</td>
                  <td><Badge>{r.role}</Badge></td>
                  <td>
                    {ttnReady(r.id) ? (
                      <span className="ftn-pill is-ok">✅ Prêt</span>
                    ) : (
                      <span className="ftn-pill is-warn">⚠️ À config</span>
                    )}
                  </td>
                  <td className="text-right">
                    <Link className="ftn-link" href={`/companies/${r.id}`}>Ouvrir</Link>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
