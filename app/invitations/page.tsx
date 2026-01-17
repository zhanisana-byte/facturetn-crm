import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Badge, Table } from "@/components/ui";
import InvitationsClient from "./InvitationsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      role,
      objective,
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
      company_name: i.companies?.company_name ?? "Page",
      tax_id: i.companies?.tax_id ?? "—",
      role: i.role,
      objective: i.objective,
    })) ?? [];

  return (
    <AppShell
      accountType="profil"
      title="Invitations"
      subtitle="Accepter ou refuser les accès reçus"
    >
      <Card title="Mes invitations reçues" subtitle="Triées par date (en attente)">
        {/* 🔹 Légende */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Badge>Gestion société</Badge>
          <Badge>Gestion page (Owner / Admin)</Badge>
        </div>

        {/* 🔹 Aucune invitation */}
        {rows.length === 0 && (
          <div className="ftn-muted">
            Aucune invitation en attente.
            <div className="text-xs mt-1">
              Astuce : vérifiez que vous êtes connecté avec{" "}
              <b>le même email</b> utilisé pour vous inviter.
            </div>
          </div>
        )}

        {/* 🔹 Liste des invitations */}
        {rows.length > 0 && (
          <>
            <Table
              head={
                <tr>
                  <th>Page</th>
                  <th>Matricule</th>
                  <th>Type d’accès</th>
                  <th>Rôle</th>
                  <th className="text-right">Action</th>
                </tr>
              }
            >
              {rows.map((r: any) => (
                <tr key={r.id}>
                  <td className="font-semibold">{r.company_name}</td>
                  <td>{r.tax_id}</td>
                  <td>
                    <Badge>
                      {r.objective === "page_management"
                        ? "Gestion page"
                        : "Gestion société"}
                    </Badge>
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

            <div className="ftn-muted mt-3 text-xs">
              Vous devez être connecté avec le même email que celui utilisé
              lors de l’invitation.
            </div>
          </>
        )}
      </Card>
    </AppShell>
  );
}
