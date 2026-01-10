import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";

export const dynamic = "force-dynamic";

export default async function RecapPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: rows } = await supabase
    .from("memberships")
    .select(`
      id,
      role,
      permissions,
      companies(name),
      users:users(email, full_name)
    `)
    .eq("is_active", true);

  return (
    <AppShell
      title="Récap"
      subtitle="Qui gère quoi et avec quelles permissions"
      accountType="comptable"
    >
      <div className="card">
        <h3 className="card-title">🔐 Accès & permissions</h3>

        <table className="table">
          <thead>
            <tr>
              <th>Personne</th>
              <th>Société</th>
              <th>Rôle</th>
              <th>Permissions</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r: any) => (
              <tr key={r.id}>
                <td>{r.users?.full_name || r.users?.email}</td>
                <td>{r.companies?.name}</td>
                <td>{r.role}</td>
                <td>
                  {r.permissions?.join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
