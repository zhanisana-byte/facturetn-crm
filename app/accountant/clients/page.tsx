import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCabinetContext, requireCabinet } from "@/lib/accountant/cabinet-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  id: string;
  name: string;
  taxId: string;
  linkType: "managed";
  endsAt?: string | null;
  daysLeft?: number | null;
  managedBy: string[];
};

function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  const diff = Math.ceil((b - a) / (1000 * 60 * 60 * 24));
  return diff;
}

export default async function AccountantClientsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  const ctx = await resolveCabinetContext(supabase, userId);
  requireCabinet(ctx);

  const { data: myMember } = await supabase
    .from("group_members")
    .select("role,is_active")
    .eq("group_id", ctx.cabinetGroupId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  const myRole = String(myMember?.role ?? "").toLowerCase();
  const canManage = ["owner", "admin"].includes(myRole);

  const { data: links } = await supabase
    .from("group_companies")
    .select("company_id, link_type, created_at, companies(id,company_name,tax_id)")
    .eq("group_id", ctx.cabinetGroupId)
    .order("created_at", { ascending: false });

  const rowsBase: Row[] =
    (links ?? []).map((x: any) => ({
      id: String(x?.companies?.id ?? x?.company_id),
      name: String(x?.companies?.company_name ?? "Société"),
      taxId: String(x?.companies?.tax_id ?? "—"),
      linkType: "managed",
      endsAt: null,
      daysLeft: null,
      managedBy: [],
    })) ?? [];

  const nowIso = new Date().toISOString();
  const ids = rowsBase.map((r) => r.id).slice(0, 500);

  if (ids.length > 0) {
    const { data: subs } = await supabase
      .from("company_subscriptions")
      .select("company_id, ends_at")
      .in("company_id", ids);

    const map = new Map<string, string>();
    (subs ?? []).forEach((s: any) => {
      if (s?.company_id && s?.ends_at) map.set(String(s.company_id), String(s.ends_at));
    });

    rowsBase.forEach((r) => {
      const endsAt = map.get(r.id) ?? null;
      r.endsAt = endsAt;
      r.daysLeft = endsAt ? daysBetween(nowIso, endsAt) : null;
    });
  }

  const { data: members } = await supabase
    .from("group_members")
    .select("id, user_id, role, permissions, is_active, app_users(full_name,email)")
    .eq("group_id", ctx.cabinetGroupId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const activeMembers = (members ?? []) as any[];

  function memberCanManageCompany(m: any, companyId: string) {
    const perms = m?.permissions || {};
    const scope = String(perms.manage_companies_scope ?? "none");
    const ids: string[] = Array.isArray(perms.manage_company_ids) ? perms.manage_company_ids : [];
    if (scope === "all") return true;
    if (scope === "selected") return ids.includes(companyId);
    return false;
  }

  rowsBase.forEach((r) => {
    const names = activeMembers
      .filter((m) => memberCanManageCompany(m, r.id))
      .map((m) => String(m?.app_users?.full_name ?? m?.app_users?.email ?? "Membre"));
    r.managedBy = names;
  });

  rowsBase.sort((a, b) => {
    const da = a.daysLeft ?? 999999;
    const db = b.daysLeft ?? 999999;
    return da - db;
  });

  async function revoke(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    const ctx = await resolveCabinetContext(supabase, auth.user.id);
    requireCabinet(ctx);

    const companyId = String(formData.get("company_id") ?? "");
    const linkType = String(formData.get("link_type") ?? "");

    if (!companyId) {
      redirect("/accountant/clients");
    }

    const { data: me } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", ctx.cabinetGroupId)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    const role = String(me?.role ?? "").toLowerCase();
    if (!["owner", "admin"].includes(role)) {
      redirect("/accountant/clients");
    }

    await supabase.from("group_companies").delete().eq("group_id", ctx.cabinetGroupId).eq("company_id", companyId);

    const { data: members } = await supabase
      .from("group_members")
      .select("id, permissions")
      .eq("group_id", ctx.cabinetGroupId)
      .eq("is_active", true);

    for (const m of members ?? []) {
      const perms: any = (m as any).permissions || {};
      const scope = String(perms.manage_companies_scope ?? "none");
      const ids: string[] = Array.isArray(perms.manage_company_ids) ? perms.manage_company_ids : [];
      if (scope === "selected" && ids.includes(companyId)) {
        const next = ids.filter((x) => x !== companyId);
        await supabase
          .from("group_members")
          .update({ permissions: { ...perms, manage_company_ids: next }, updated_at: new Date().toISOString() } as any)
          .eq("id", (m as any).id);
      }
    }

    redirect("/accountant/clients");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Mes clients</div>
            <div className="text-sm opacity-80">Sociétés liées au cabinet</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="ftn-btn" href="/accountant/invitations" prefetch={false}>Invitations</Link>
            <Link className="ftn-btn" href="/accountant/team" prefetch={false}>Équipe & accès</Link>
            <Link className="ftn-btn ftn-btn-ghost" href="/accountant" prefetch={false}>Dashboard</Link>
          </div>
        </div>
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold">Liste ({rowsBase.length})</div>

        {rowsBase.length === 0 ? (
          <div className="mt-2 text-sm opacity-80">Aucune société liée.</div>
        ) : (
          <div className="mt-3 grid gap-2">
            {rowsBase.map((r) => {
              const expSoon = (r.daysLeft ?? 999999) <= 30;
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border p-3"
                  style={{ borderColor: expSoon ? "rgba(251,191,36,.55)" : "rgba(148,163,184,.24)" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs opacity-70">
                        MF: {r.taxId} • Type: {"Société gérée"} • Fin abo:{" "}
                        <b>{r.endsAt ? new Date(r.endsAt).toLocaleDateString() : "—"}</b>
                        {r.daysLeft !== null ? ` • ${r.daysLeft} j` : ""}
                      </div>
                      <div className="mt-1 text-xs opacity-70">
                        Géré par :{" "}
                        <b>{r.managedBy.length ? r.managedBy.join(", ") : "—"}</b>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link className="ftn-btn" href={`/companies/${r.id}`} prefetch={false}>Ouvrir</Link>
                      <Link className="ftn-btn" href={`/companies/${r.id}/ttn`} prefetch={false}>TTN</Link>

                      {canManage && r.linkType === "managed" ? (
                        <form action={revoke}>
                          <input type="hidden" name="company_id" value={r.id} />
                          <input type="hidden" name="link_type" value={r.linkType} />
                          <button className="ftn-btn ftn-btn-ghost" type="submit">
                            Révoquer accès
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
