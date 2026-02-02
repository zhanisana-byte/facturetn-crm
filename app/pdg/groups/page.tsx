import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card, Table, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

type SearchParamsShape = {
  q?: string;
};

export default async function PdgGroupsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>;
}) {
  const sp = (await searchParams) ?? {};
  const q = (sp.q ?? "").trim();

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", auth.user.id)
    .single();

  if (profile?.account_type !== "pdg") redirect("/dashboard");

  const like = q ? `%${q}%` : "";
  const { data: groups, error } = await (q
    ? supabase
        .from("groups")
        .select("id,name,created_at")
        .ilike("name", like)
        .order("created_at", { ascending: false })
    : supabase
        .from("groups")
        .select("id,name,created_at")
        .order("created_at", { ascending: false }));

  const rows = groups ?? [];

  return (
    <AppShell
      title="Groupes"
      subtitle="PDG — إدارة المجموعات"
      accountType="profil"
    >
      <div className="ftn-grid">
        <Card title="Recherche" subtitle="Chercher un groupe par nom">
          <form className="flex gap-2" action="/pdg/groups" method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="Nom du groupe..."
              className="w-full max-w-md rounded-xl border px-3 py-2 text-sm"
            />
            <button className="ftn-btn" type="submit">
              Rechercher
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>Total: {rows.length}</Badge>
            {q ? <Badge>Filtre: {q}</Badge> : <Badge>Sans filtre</Badge>}
          </div>
        </Card>

        <Card title="Liste des groupes" subtitle="Accès détails / équipe / archives">
          {error ? <div className="ftn-alert">{error.message}</div> : null}

          {rows.length === 0 ? (
            <div className="ftn-muted">Aucun groupe trouvé.</div>
          ) : (
            <Table
              head={
                <tr>
                  <th>Nom</th>
                  <th>Création</th>
                  <th>Actions</th>
                </tr>
              }
            >
              {rows.map((g: any) => (
                <tr key={g.id}>
                  <td className="font-semibold">{g.name ?? "Groupe"}</td>
                  <td>
                    {g.created_at
                      ? new Date(g.created_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="flex flex-wrap gap-2">
                    <Link className="ftn-btn ftn-btn-soft" href={`/groups/${g.id}`}>
                      Ouvrir
                    </Link>
                    <Link className="ftn-btn ftn-btn-soft" href={`/groups/${g.id}/team`}>
                      Équipe
                    </Link>
                    <Link
                      className="ftn-btn ftn-btn-soft"
                      href={`/groups/${g.id}/archives`}
                    >
                      Archives
                    </Link>
                    <Link className="ftn-btn ftn-btn-soft" href={`/groups/${g.id}/ttn`}>
                      TTN
                    </Link>
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
