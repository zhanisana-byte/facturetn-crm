import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import InvitationActions from "./InvitationActions";

type Kind = "sent" | "received";

type PageProps = { searchParams?: Promise<{ kind?: string }> };

export default async function InvitationsPage({ searchParams }: PageProps) {
  const sp: { kind?: string } = (await searchParams) ?? {};
  const kind: Kind = sp.kind === "sent" ? "sent" : "received";

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,email,account_type")
    .eq("id", user.id)
    .single();

  const myEmail = String(profile?.email || "").toLowerCase();
  const accountType = profile?.account_type ?? "entreprise";

  let query = supabase
    .from("access_invitations")
    .select(
      `
      id,
      invited_email,
      status,
      expires_at,
      created_at,
      token,
      companies ( company_name, tax_id )
    `
    )
    .order("created_at", { ascending: false });

  if (kind === "sent") query = query.eq("invited_by_user_id", user.id);
  else query = query.eq("invited_email", myEmail);

  const { data } = await query;
  const invitations = data ?? [];

  return (
    <AppShell title="Invitations" subtitle="Invitations envoyées et reçues" accountType={accountType}>
      <div className="flex gap-3 mb-6">
        <Link
          href="/invitations?kind=received"
          className={`px-4 py-2 rounded-lg text-sm ${
            kind === "received" ? "bg-black text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Reçues
        </Link>
        <Link
          href="/invitations?kind=sent"
          className={`px-4 py-2 rounded-lg text-sm ${
            kind === "sent" ? "bg-black text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          Envoyées
        </Link>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3">Société</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Expiration</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {invitations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Aucune invitation.
                </td>
              </tr>
            )}

            {invitations.map((inv: any) => (
              <tr key={inv.id} className="border-t">
                <td className="px-4 py-3">{inv.companies?.company_name ?? "-"}</td>
                <td className="px-4 py-3">{inv.invited_email}</td>
                <td className="px-4 py-3 capitalize">{inv.status}</td>
                <td className="px-4 py-3">
                  {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "-"}
                </td>
                <td className="px-4 py-3">
                  <InvitationActions kind={kind} token={inv.token} status={inv.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
