import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function switchToGroup(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const groupId = String(formData.get("group_id") ?? "").trim();
  if (!groupId) redirect("/groups/select?error=missing");

  await supabase.from("user_workspace").upsert(
    {
      user_id: user.id,
      active_mode: "multi_societe",
      active_company_id: null,
      active_group_id: groupId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  redirect(`/groups/${groupId}`);
}

export default async function GroupSelectPage(props: { searchParams?: Promise<{ error?: string }> }) {
  const searchParams = (await props.searchParams) ?? ({} as any);
  const { error } = searchParams as any;

  const supabase = await createClient();
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("group_members")
    .select("group_id, role, groups(id,group_name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const groups = (rows ?? [])
    .map((r: any) => ({
      id: r.groups?.id ?? r.group_id,
      group_name: r.groups?.group_name ?? "Groupe",
      role: r.role ?? "member",
    }))
    .filter((g: any) => !!g.id);

  return (
    <AppShell title="Sélectionner un groupe" subtitle="Espace Profil">
      <div className="ftn-wrap">
        <div className="ftn-card-lux ftn-reveal">
          <div className="ftn-card-glow" />
          <div className="ftn-card-head">
            <div className="ftn-card-titleRow">
              <div className="ftn-ic"></div>
              <div>
                <div className="ftn-card-title">Basculer vers un groupe</div>
                <div className="ftn-card-sub">Choisissez un groupe pour afficher son espace.</div>
              </div>
            </div>
            <div className="ftn-card-right">
              <Link className="ftn-btn-ghost" href="/groups">
                Retour
              </Link>
            </div>
          </div>

          <div className="ftn-card-body">
            {error ? <div className="ftn-err">Veuillez choisir un groupe.</div> : null}

            {groups.length === 0 ? (
              <div className="ftn-muted">
                Aucun groupe disponible. <Link className="ftn-link" href="/groups/create">Créer un groupe</Link>
              </div>
            ) : (
              <form action={switchToGroup} className="ftn-grid" style={{ maxWidth: 520 }}>
                <label className="ftn-label">Groupe</label>
                <select name="group_id" className="ftn-input" required>
                  <option value="">— Choisir —</option>
                  {groups.map((g: any) => (
                    <option key={g.id} value={g.id}>
                      {g.group_name} ({g.role})
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <button className="ftn-btn" type="submit">
                    Ouvrir
                  </button>
                  <Link className="ftn-btn-ghost" href="/switch">
                    Switch
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
