import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function createGroup(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const group_name = String(formData.get("group_name") ?? "").trim();
  if (!group_name) redirect("/groups/create?error=missing");

  const { data: group, error: gErr } = await supabase
    .from("groups")
    .insert({ group_name, owner_user_id: auth.user.id, group_type: "multi" })
    .select("id")
    .single();

  if (gErr || !group?.id) redirect("/groups/create?error=create_failed");

  await supabase.from("group_members").upsert(
    { group_id: group.id, user_id: auth.user.id, role: "owner", is_active: true },
    { onConflict: "group_id,user_id" }
  );

  await supabase.from("user_workspace").upsert(
    {
      user_id: auth.user.id,
      active_mode: "multi_societe",
      active_company_id: null,
      active_group_id: group.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  redirect(`/groups/success?id=${group.id}`);
}

type SP = { error?: string };

export default async function GroupCreatePage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const sp = (await searchParams) ?? {};
  const error = sp.error;

  return (
    <AppShell title="Créer un groupe">
      <Card className="p-6 max-w-xl">
        <p className="text-sm text-slate-600">
          Donnez un <b>nom</b> à votre groupe. Vous pourrez compléter le reste après création.
        </p>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error === "missing" && "Veuillez saisir le nom du groupe."}
            {error === "create_failed" && "Impossible de créer le groupe. Réessayez."}
          </div>
        ) : null}

        <form action={createGroup} className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Nom du groupe</label>
            <input name="group_name" className="h-10 rounded-md border px-3" required />
          </div>

          <div className="flex gap-2">
            <button className="h-10 rounded-md bg-black px-4 text-white text-sm">
              Créer et continuer
            </button>
            <a
              href="/pages/new"
              className="h-10 rounded-md border px-4 text-sm inline-flex items-center"
            >
              Annuler
            </a>
          </div>
        </form>
      </Card>
    </AppShell>
  );
}
