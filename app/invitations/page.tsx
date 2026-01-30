import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Badge, Table } from "@/components/ui";
import InvitationsClient from "./InvitationsClient";

export const dynamic = "force-dynamic";
export default async function InvitationsPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const userId = auth.user.id;

  // 🔹 récupérer l’email du profil connecté
  const { data: me } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const myEmail = String(me?.email || "").toLowerCase();

  if (!myEmail) {
    return (
      <AppShell accountType="profil" title="Invitations" subtitle="Accès reçus">
        <Card title="Erreur">
          <div className="ftn-alert tone-bad">
            Impossible de déterminer votre email.
          </div>
        </Card>
      </AppShell>
    );
  }

  // 🔹 invitations reçues PAR EMAIL
  const { data: invites } = await supabase
    .from("access_invitations")
    .select(
      `
      id,
      token,
      kind,
      role,
      objective,
      can_manage_customers,
      can_create_invoices,
      can_validate_invoices,
      can_submit_ttn,
      status,
      created_at,
      companies (
        id,
        company_name,
        tax_id
      )
    `
    )
    .eq("invited_email", myEmail)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const rows =
    invites?.map((i: any) => ({
      id: i.id,
      token: i.token,
      kind: String(i.kind || "entity"),
      company_name: i.companies?.company_name ?? "Page",
      tax_id: i.companies?.tax_id ?? "—",
      role: i.role,
      objective: i.objective,
      can_manage_customers: Boolean(i.can_manage_customers),
      can_create_invoices: Boolean(i.can_create_invoices),
      can_validate_invoices: Boolean(i.can_validate_invoices),
      can_submit_ttn: Boolean(i.can_submit_ttn),
    })) ?? [];

  const entityInvites = rows.filter((r: any) => r.kind !== "delegation");
  const delegationInvites = rows.filter((r: any) => r.kind === "delegation");

  return (
    <AppShell
      accountType="profil"
      title="Invitations"
      subtitle="Accepter ou refuser les accès reçus"
    >
      <Card title="Mes invitations reçues" subtitle="Triées par date (en attente)">
        {rows.length === 0 ? (
          <div className="ftn-muted">
            Aucune invitation en attente.
            <div className="text-xs mt-1">
              Astuce : vérifiez que vous êtes connecté avec <b>le même email</b> utilisé pour vous inviter.
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge>Type A</Badge>
                <div className="text-sm font-semibold">Invitations d’accès aux entités</div>
              </div>
              {entityInvites.length === 0 ? (
                <div className="ftn-muted">Aucune invitation d’entité.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table
                    head={
                      <tr>
                        <th>Entité</th>
                        <th>MF</th>
                        <th>Objectif</th>
                        <th>Rôle</th>
                        <th className="text-right">Action</th>
                      </tr>
                    }
                  >
                    {entityInvites.map((r: any) => (
                      <tr key={r.id}>
                        <td className="font-semibold">{r.company_name}</td>
                        <td>{r.tax_id}</td>
                        <td>
                          <Badge>{r.objective === "page_management" ? "Gestion page" : "Accès entité"}</Badge>
                        </td>
                        <td>
                          <Badge>{String(r.role || "viewer").toUpperCase()}</Badge>
                        </td>
                        <td className="text-right">
                          <InvitationsClient token={r.token} />
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge>Type B</Badge>
                <div className="text-sm font-semibold">Invitations de délégation Factures / TTN</div>
              </div>
              {delegationInvites.length === 0 ? (
                <div className="ftn-muted">Aucune invitation de délégation.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table
                    head={
                      <tr>
                        <th>Entité</th>
                        <th>MF</th>
                        <th>Permissions</th>
                        <th className="text-right">Action</th>
                      </tr>
                    }
                  >
                    {delegationInvites.map((r: any) => (
                      <tr key={r.id}>
                        <td className="font-semibold">{r.company_name}</td>
                        <td>{r.tax_id}</td>
                        <td>
                          <div className="flex flex-wrap gap-2">
                            {r.can_create_invoices ? <Badge>Créer facture</Badge> : null}
                            {r.can_validate_invoices ? <Badge>Valider</Badge> : null}
                            {r.can_submit_ttn ? <Badge>Envoyer TTN</Badge> : null}
                            {r.can_manage_customers ? <Badge>Gérer entités</Badge> : null}
                            {!r.can_create_invoices && !r.can_validate_invoices && !r.can_submit_ttn && !r.can_manage_customers ? (
                              <Badge>Lecture</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="text-right">
                          <InvitationsClient token={r.token} />
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>
              )}
            </div>

            <div className="ftn-muted text-xs">
              Vous devez être connecté avec le même email que celui utilisé lors de l’invitation.
            </div>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
