import { redirect } from "next/navigation";
import Link from "next/link";

import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Table } from "@/components/ui";

export const dynamic = "force-dynamic";
type MemberRow = {
  user_id: string;
  email: string;
  role: string;
  can_manage_customers: boolean;
  can_create_invoices: boolean;
  can_validate_invoices: boolean;
  can_submit_ttn: boolean;
};

export default async function ProfilePermissionsPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const userId = auth.user.id;

  // 1) Les sociétés où je suis OWNER => je peux gérer la délégation (factures/TTN)
  const { data: owned } = await supabase
    .from("memberships")
    .select("company_id, companies(id, company_name, tax_id)")
    .eq("user_id", userId)
    .eq("is_active", true)
    .eq("role", "owner");

  const ownedCompanies = (owned ?? [])
    .map((m: any) => m?.companies)
    .filter(Boolean)
    .map((c: any) => ({
      id: String(c.id),
      name: String(c.company_name ?? "Société"),
      tax_id: String(c.tax_id ?? "—"),
    }));

  // 2) Invitations de délégation en attente (type B)
  const { data: pendingDelegations } = await supabase
    .from("access_invitations")
    .select(
      "id, company_id, invited_email, role, can_manage_customers, can_create_invoices, can_validate_invoices, can_submit_ttn, status, created_at, kind"
    )
    .eq("invited_by_user_id", userId)
    .eq("status", "pending")
    .eq("kind", "delegation")
    .order("created_at", { ascending: false });

  // 3) Pour chaque société owner : liste des membres + permissions
  const companiesWithMembers = [] as Array<{
    company: { id: string; name: string; tax_id: string };
    members: MemberRow[];
  }>;

  for (const c of ownedCompanies) {
    const { data: mem } = await supabase
      .from("memberships")
      .select(
        "user_id, role, can_manage_customers, can_create_invoices, can_validate_invoices, can_submit_ttn, is_active, app_users(email)"
      )
      .eq("company_id", c.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    const members: MemberRow[] = (mem ?? []).map((m: any) => ({
      user_id: String(m.user_id),
      email: String(m.app_users?.email ?? "—"),
      role: String(m.role ?? "viewer"),
      can_manage_customers: Boolean(m.can_manage_customers),
      can_create_invoices: Boolean(m.can_create_invoices),
      can_validate_invoices: Boolean(m.can_validate_invoices),
      can_submit_ttn: Boolean(m.can_submit_ttn),
    }));

    companiesWithMembers.push({ company: c, members });
  }

  return (
    <AppShell accountType="profil" title="Accès & permissions" subtitle="Délégation Facturation / TTN">
      <div className="mx-auto w-full max-w-6xl p-6 space-y-6">
        <Card
          title="Invitations de délégation en attente"
          subtitle="Accès Factures/TTN envoyés (type B)"
        >
          {!pendingDelegations || pendingDelegations.length === 0 ? (
            <div className="ftn-muted">Aucune invitation de délégation en attente.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table
                head={
                  <tr>
                    <th>Email</th>
                    <th>Société</th>
                    <th>Permissions</th>
                    <th>Rôle</th>
                  </tr>
                }
              >
                {pendingDelegations.map((inv: any) => {
                  const c = ownedCompanies.find((x) => x.id === String(inv.company_id));
                  return (
                    <tr key={inv.id}>
                      <td className="font-medium">{String(inv.invited_email || "—")}</td>
                      <td>
                        {c ? (
                          <>
                            <div className="font-semibold">{c.name}</div>
                            <div className="text-xs text-slate-500">MF : {c.tax_id}</div>
                          </>
                        ) : (
                          <span className="ftn-muted">—</span>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {inv.can_create_invoices ? <Badge>Créer facture</Badge> : null}
                          {inv.can_validate_invoices ? <Badge>Valider</Badge> : null}
                          {inv.can_submit_ttn ? <Badge>Envoyer TTN</Badge> : null}
                          {inv.can_manage_customers ? <Badge>Gérer entités</Badge> : null}
                          {!inv.can_create_invoices && !inv.can_validate_invoices && !inv.can_submit_ttn && !inv.can_manage_customers ? (
                            <Badge>Lecture</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <Badge>{String(inv.role || "viewer").toUpperCase()}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          )}
        </Card>

        <Card
          title="Accès actifs par société"
          subtitle="Membres + permissions (visible uniquement sur les sociétés dont vous es OWNER)"
        >
          {companiesWithMembers.length === 0 ? (
            <div className="ftn-muted">
              vous n’es OWNER d’aucune société pour le moment.
              <div className="text-xs mt-1">Crée une société depuis “Création de page”, ou demande à être owner.</div>
            </div>
          ) : (
            <div className="space-y-6">
              {companiesWithMembers.map(({ company, members }) => (
                <div key={company.id} className="rounded-xl border p-4 bg-white">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">{company.name}</div>
                      <div className="text-xs text-slate-500">MF : {company.tax_id}</div>
                    </div>
                    <Link
                      className="ftn-btn-lux ftn-btn-ghost"
                      href={`/companies/${company.id}/droits?tab=permissions`}
                      prefetch={false}
                    >
                      <span className="ftn-btn-shine" aria-hidden="true" />
                      <span className="ftn-btn-text">Gérer dans l’entité</span>
                    </Link>
                  </div>

                  {members.length === 0 ? (
                    <div className="ftn-muted mt-3">Aucun membre.</div>
                  ) : (
                    <div className="overflow-x-auto mt-4">
                      <Table
                        head={
                          <tr>
                            <th>Email</th>
                            <th>Rôle</th>
                            <th>Permissions</th>
                          </tr>
                        }
                      >
                        {members.map((m) => (
                          <tr key={m.user_id}>
                            <td className="font-medium">{m.email}</td>
                            <td>
                              <Badge>{m.role.toUpperCase()}</Badge>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-2">
                                {m.can_create_invoices ? <Badge>Créer facture</Badge> : null}
                                {m.can_validate_invoices ? <Badge>Valider</Badge> : null}
                                {m.can_submit_ttn ? <Badge>Envoyer TTN</Badge> : null}
                                {m.can_manage_customers ? <Badge>Gérer entités</Badge> : null}
                                {!m.can_create_invoices && !m.can_validate_invoices && !m.can_submit_ttn && !m.can_manage_customers ? (
                                  <Badge>Lecture</Badge>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </Table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
