import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function enc(v: string) {
  return encodeURIComponent(v).slice(0, 180);
}

async function createGroup(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const group_name = String(formData.get("group_name") ?? "").trim();
  if (!group_name) redirect("/groups/create?error=missing");

  const admin = createAdminClient();
  const email = user.email ?? null;
  const fullName =
    (user.user_metadata as any)?.full_name ||
    (user.user_metadata as any)?.name ||
    email ||
    "Utilisateur";

  const { error: upErr } = await admin.from("app_users").upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (upErr) redirect(`/groups/create?error=${enc("app_users: " + upErr.message)}`);

  const { data: group, error: gErr } = await supabase
    .from("groups")
    .insert({ group_name, owner_user_id: user.id, group_type: "multi" })
    .select("id")
    .single();

  if (gErr || !group?.id) redirect(`/groups/create?error=${enc(gErr?.message || "create_failed")}`);

  const { error: mErr } = await supabase.from("group_members").upsert(
    { group_id: group.id, user_id: user.id, role: "owner", is_active: true },
    { onConflict: "group_id,user_id" }
  );
  if (mErr) redirect(`/groups/create?error=${enc("member: " + mErr.message)}`);

  const { error: wErr } = await supabase.from("user_workspace").upsert(
    {
      user_id: user.id,
      active_mode: "multi_societe",
      active_company_id: null,
      active_group_id: group.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (wErr) redirect(`/groups/create?error=${enc("workspace: " + wErr.message)}`);

  redirect(`/groups/success?group=${group.id}`);
}

export default async function GroupCreatePage(props: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const searchParams = (await props.searchParams) ?? ({} as any);
  const { error } = searchParams as any;

  return (
    <AppShell title="Créer un groupe" subtitle="Espace Profil">
      <div className="ftn-wrap">
        <div className="ftn-card-lux ftn-reveal">
          <div className="ftn-card-glow" />
          <div className="ftn-card-head">
            <div className="ftn-card-titleRow">
              <div className="ftn-ic"></div>
              <div>
                <div className="ftn-card-title">Nouveau groupe</div>
                <div className="ftn-card-sub">
                  Donnez un nom au groupe, puis vous pourrez ajouter / inviter des sociétés.
                </div>
              </div>
            </div>
            <div className="ftn-card-right">
              <Link className="ftn-btn-ghost" href="/groups">
                Retour
              </Link>
            </div>
          </div>

          <div className="ftn-card-body">
            {error ? (
              <div className="ftn-err">
                {error === "missing"
                  ? "Veuillez saisir le nom du groupe."
                  : decodeURIComponent(String(error))}
              </div>
            ) : null}

            <form action={createGroup} className="ftn-grid" style={{ maxWidth: 520 }}>
              <label className="ftn-label">Nom du groupe</label>
              <input name="group_name" className="ftn-input" placeholder="Ex: Groupe Sana" required />

              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <button className="ftn-btn" type="submit">
                  Créer et ouvrir
                </button>
                <Link className="ftn-btn-ghost" href="/groups">
                  Annuler
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
