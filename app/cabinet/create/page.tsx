import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Search = { error?: string; ok?: string };
type PageProps = { searchParams?: Promise<Search> };

async function createCabinet(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const cabinet_name = String(formData.get("cabinet_name") ?? "").trim();
  if (!cabinet_name) redirect("/cabinet/create?error=missing");

  // 1) Créer le groupe cabinet
  const { data: group, error: gErr } = await supabase
    .from("groups")
    .insert({
      group_name: cabinet_name,
      group_type: "cabinet",
      owner_user_id: user.id,
    })
    .select("id")
    .single();

  if (gErr || !group?.id) redirect("/cabinet/create?error=create_failed");

  const cabinetGroupId = String(group.id);

  // 2) Membership owner (important : apparaître dans Équipe & permissions)
  const { error: gmErr } = await supabase.from("group_members").upsert(
    { group_id: cabinetGroupId, user_id: user.id, role: "owner", is_active: true } as any,
    { onConflict: "group_id,user_id" } as any
  );
  if (gmErr) redirect("/cabinet/create?error=member_failed");

  // 3) Forcer le workspace cabinet (pour que le sidebar Cabinet fonctionne tout de suite)
  await supabase
    .from("user_workspace")
    .upsert(
      {
        user_id: user.id,
        active_mode: "comptable",
        active_company_id: null,
        active_group_id: cabinetGroupId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  redirect("/accountant/team?created=1");
}

export default async function CabinetCreatePage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const error = sp.error ?? null;
  const ok = sp.ok ?? null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl p-6 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-lg font-semibold text-slate-900">Créer un cabinet</div>
          <div className="mt-1 text-sm text-slate-600">
            Saisissez uniquement le nom du cabinet. Vous pourrez ensuite lier des sociétés et gérer votre équipe.
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error === "missing"
              ? "Le nom du cabinet est obligatoire."
              : "Une erreur est survenue. Veuillez réessayer."}
          </div>
        ) : null}

        {ok ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Cabinet créé avec succès.
          </div>
        ) : null}

        <form action={createCabinet} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700">Nom du cabinet</label>
            <input
              name="cabinet_name"
              placeholder="Ex. Cabinet Sana Compta"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Link href="/pages/new" className="text-sm text-slate-600 hover:underline">
              Retour
            </Link>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white"
            >
              Créer le cabinet
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
