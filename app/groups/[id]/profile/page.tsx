import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ ok?: string; error?: string }>;
};

function clean(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="ftn-badge">{children}</span>;
}

export default async function GroupProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const supabase = await createClient();
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase, user.id);
  if (ws?.active_mode !== "multi_societe" || ws?.active_group_id !== id) {
    try {
      await supabase.from("user_workspace").upsert(
        {
          user_id: user.id,
          active_mode: "multi_societe",
          active_company_id: null,
          active_group_id: id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch {
      
    }
  }

  const { data: group } = await supabase
    .from("groups")
    .select(
      "id,group_name,owner_user_id,created_at,billing_name,billing_tax_id,billing_address,billing_email,billing_phone"
    )
    .eq("id", id)
    .maybeSingle();

  if (!group?.id) {
    return <div className="ftn-alert">Groupe introuvable.</div>;
  }

  const isOwner = group.owner_user_id === user.id;
  let myRole: string | null = isOwner ? "owner" : null;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    myRole = gm?.role ?? null;
  }
  if (!isOwner && myRole !== "admin") {
    return <div className="ftn-alert">Vous n&apos;avez pas accès à ce groupe.</div>;
  }

  async function updateBilling(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    const { data: g } = await supabase
      .from("groups")
      .select("id,owner_user_id")
      .eq("id", id)
      .maybeSingle();
    if (!g?.id) redirect(`/groups/${id}/profile?error=Groupe introuvable`);
    const isOwner = g.owner_user_id === auth.user.id;
    let role: string | null = isOwner ? "owner" : null;
    if (!isOwner) {
      const { data: gm } = await supabase
        .from("group_members")
        .select("role,is_active")
        .eq("group_id", id)
        .eq("user_id", auth.user.id)
        .eq("is_active", true)
        .maybeSingle();
      role = gm?.role ?? null;
    }
    if (!isOwner && role !== "admin") redirect(`/groups/${id}/profile?error=Accès refusé`);

    const payload = {
      billing_name: clean(formData.get("billing_name")),
      billing_tax_id: clean(formData.get("billing_tax_id")),
      billing_address: clean(formData.get("billing_address")),
      billing_email: clean(formData.get("billing_email")),
      billing_phone: clean(formData.get("billing_phone")),
    };

    const { error } = await supabase.from("groups").update(payload).eq("id", id);
    if (error) redirect(`/groups/${id}/profile?error=${encodeURIComponent(error.message)}`);
    redirect(`/groups/${id}/profile?ok=1`);
  }

  const { data: owner } = await supabase
    .from("app_users")
    .select("id,full_name,email")
    .eq("id", group.owner_user_id)
    .maybeSingle();

  const { data: members } = await supabase
    .from("group_members")
    .select("id,user_id,role,is_active,created_at, app_users:app_users(full_name,email)")
    .eq("group_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      {sp?.ok ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Profil de facturation enregistré.
        </div>
      ) : null}
      {sp?.error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {sp.error}
        </div>
      ) : null}

      <div className="ftn-card-lux">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Profil facturé (Groupe)</div>
            <div className="ftn-card-sub">
              MF / Nom / Adresse / Email — utilisé pour la facturation du pack Groupe.
            </div>
          </div>
          <div className="ftn-card-right">
            <Badge>29 DT / société gérée active</Badge>
          </div>
        </div>
        <div className="ftn-card-body">
          <form action={updateBilling} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-500 mb-1">Nom (facturation)</div>
              <input
                className="ftn-input"
                name="billing_name"
                defaultValue={group.billing_name ?? ""}
                placeholder="Nom / Raison sociale"
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">MF (Matricule fiscal)</div>
              <input
                className="ftn-input"
                name="billing_tax_id"
                defaultValue={group.billing_tax_id ?? ""}
                placeholder="1304544Z"
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-slate-500 mb-1">Adresse</div>
              <input
                className="ftn-input"
                name="billing_address"
                defaultValue={group.billing_address ?? ""}
                placeholder="Adresse complète"
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Email</div>
              <input
                className="ftn-input"
                name="billing_email"
                defaultValue={group.billing_email ?? ""}
                placeholder="ex: contact@domaine.tn"
              />
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">Téléphone</div>
              <input
                className="ftn-input"
                name="billing_phone"
                defaultValue={group.billing_phone ?? ""}
                placeholder="+216 ..."
              />
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-2 pt-2">
              <button className="ftn-btn" type="submit">
                Enregistrer
              </button>
              <Link className="ftn-btn ftn-btn-ghost" href={`/groups/${id}`} prefetch={false}>
                Retour dashboard
              </Link>
            </div>
          </form>
        </div>
        <div className="ftn-card-glow" aria-hidden="true" />
      </div>

      <div className="ftn-card-lux">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">{group.group_name}</div>
            <div className="ftn-card-sub">Informations du groupe + gouvernance</div>
          </div>
          <div className="ftn-card-right">
            <Badge>{String(myRole || "admin")}</Badge>
          </div>
        </div>
        <div className="ftn-card-body text-sm text-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
              <div className="text-xs text-slate-500">Owner</div>
              <div className="font-semibold">{owner?.full_name || owner?.email || "—"}</div>
              {owner?.email ? <div className="text-xs text-slate-500">{owner.email}</div> : null}
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
              <div className="text-xs text-slate-500">Créé le</div>
              <div className="font-semibold">
                {group.created_at ? new Date(group.created_at).toLocaleDateString() : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
              <div className="text-xs text-slate-500">Membres</div>
              <div className="font-semibold">{(members ?? []).length}</div>
            </div>
          </div>
        </div>
        <div className="ftn-card-glow" aria-hidden="true" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="text-sm font-semibold">Équipe (gestion PAGE Groupe)</div>
          <div className="text-xs text-slate-500">Owner / Admin / Staff / Viewer</div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b">
                <th className="py-2 px-3">Membre</th>
                <th className="py-2 px-3">Email</th>
                <th className="py-2 px-3">Rôle</th>
                <th className="py-2 px-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((m: any) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-3 px-3 font-semibold">{m.app_users?.full_name || "—"}</td>
                  <td className="py-3 px-3 text-slate-600">{m.app_users?.email || m.user_id}</td>
                  <td className="py-3 px-3">
                    <span className="ftn-pill">{String(m.role || "staff")}</span>
                  </td>
                  <td className="py-3 px-3">
                    {m.is_active ? (
                      <span className="ftn-pill ftn-pill-ok">Actif</span>
                    ) : (
                      <span className="ftn-pill ftn-pill-warn">Inactif</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
