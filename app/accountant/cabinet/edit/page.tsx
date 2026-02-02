import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCabinetContext, requireCabinet } from "@/lib/accountant/cabinet-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = { ok?: string; err?: string };
type PageProps = { searchParams?: Promise<Search> };

async function saveCabinet(formData: FormData) {
  "use server";
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ctx = await resolveCabinetContext(supabase, auth.user.id);
  requireCabinet(ctx);

  const { data: me } = await supabase
    .from("group_members")
    .select("role,is_active")
    .eq("group_id", ctx.cabinetGroupId)
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();

  const role = String(me?.role ?? "").toLowerCase();
  if (!["owner", "admin"].includes(role)) redirect("/accountant/cabinet?err=forbidden");

  const group_name = String(formData.get("group_name") ?? "").trim();
  if (!group_name) redirect("/accountant/cabinet/edit?err=missing");

  const { error } = await supabase
    .from("groups")
    .update({ group_name, updated_at: new Date().toISOString() })
    .eq("id", ctx.cabinetGroupId);

  if (error) redirect(`/accountant/cabinet/edit?err=${encodeURIComponent(error.message)}`);

  redirect("/accountant/cabinet?ok=1");
}

export default async function CabinetEditPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};
  const ok = sp.ok ?? null;
  const err = sp.err ?? null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ctx = await resolveCabinetContext(supabase, auth.user.id);
  requireCabinet(ctx);

  const { data: cabinet } = await supabase
    .from("groups")
    .select("id, group_name")
    .eq("id", ctx.cabinetGroupId)
    .maybeSingle();

  return (
    <div className="mx-auto w-full max-w-3xl p-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-lg font-semibold text-slate-900">Mon cabinet</div>
        <div className="mt-1 text-sm text-slate-600">Modifier les informations de base du cabinet.</div>
      </div>

      {ok ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Modifications enregistrées.
        </div>
      ) : null}

      {err ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {err === "missing" ? "Le nom du cabinet est obligatoire." : err}
        </div>
      ) : null}

      <form action={saveCabinet} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <label className="text-sm font-medium text-slate-700">Nom du cabinet</label>
          <input
            name="group_name"
            defaultValue={cabinet?.group_name ?? ""}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <Link href="/accountant/cabinet" className="text-sm text-slate-600 hover:underline">
            Retour
          </Link>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white"
          >
            Enregistrer
          </button>
        </div>
      </form>
    </div>
  );
}
