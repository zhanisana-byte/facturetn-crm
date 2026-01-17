import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { params: Promise<{ id: string }> };

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="ftn-badge">{children}</span>;
}

export default async function GroupProfilePage({ params }: PageProps) {
  const { id  } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Stabiliser le contexte: workspace Groupe (sidebar fixe)
  const ws = await ensureWorkspaceRow(supabase);
  if (ws?.active_mode !== "multi_societe" || ws?.active_group_id !== id) {
    try {
      await supabase.from("user_workspace").upsert(
        {
          user_id: auth.user.id,
          active_mode: "multi_societe",
          active_company_id: null,
          active_group_id: id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch {
      // ignore
    }
  }

  const { data: group } = await supabase
    .from("groups")
    .select("id,group_name,owner_user_id,created_at")
    .eq("id", id)
    .maybeSingle();

  if (!group?.id) {
    return (
      <AppShell title="Profil Groupe" subtitle="Groupe introuvable" accountType={shellTypeFromWorkspace("multi_societe")} activeGroupId={id}>
        <div className="ftn-alert">Groupe introuvable.</div>
      </AppShell>
    );
  }

  // Authz : owner ou admin
  const isOwner = group.owner_user_id === auth.user.id;
  let myRole: string | null = isOwner ? "owner" : null;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", id)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();
    myRole = gm?.role ?? null;
  }
  if (!isOwner && myRole !== "admin") {
    return (
      <AppShell title={group.group_name} subtitle="Accès refusé" accountType={shellTypeFromWorkspace("multi_societe")} activeGroupId={id}>
        <div className="ftn-alert">Tu n&apos;as pas accès à ce groupe.</div>
      </AppShell>
    );
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
    <AppShell
      title="Profil Groupe"
      subtitle={group.group_name ?? "Groupe"}
      accountType={shellTypeFromWorkspace("multi_societe")}
      activeGroupId={id}
    >
      <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
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
                <div className="font-semibold">{group.created_at ? new Date(group.created_at).toLocaleDateString() : "—"}</div>
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
                    <td className="py-3 px-3"><span className="ftn-pill">{String(m.role || "staff")}</span></td>
                    <td className="py-3 px-3">{m.is_active ? <span className="ftn-pill ftn-pill-ok">Actif</span> : <span className="ftn-pill ftn-pill-warn">Inactif</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
