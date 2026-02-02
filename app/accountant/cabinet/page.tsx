
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CabinetClientsTable from "./CabinetClientsTable";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = {
  q?: string;
  company?: "all" | "complete" | "incomplete";
  ttn?: "all" | "complete" | "incomplete";
  page?: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}
function pick<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  const x = s(v) as T;
  return allowed.includes(x) ? x : fallback;
}
function toPage(v: unknown) {
  const n = Number(s(v) || "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function isCompanyComplete(c: any): boolean {
  if (!c) return false;
  const required = [
    c.company_name,
    c.tax_id, 
    c.address,
    c.city,
    c.postal_code,
    c.country,
  ];
  return required.every((x) => String(x ?? "").trim().length > 0);
}

function isTTNComplete(t: any): boolean {
  if (!t) return false;
  const type = String(t.connection_type ?? "").toLowerCase();
  if (type === "webservice") {
    return Boolean(t.ws_url && t.ws_login && t.ws_password && t.ws_matricule);
  }
  
  if (type === "api") {
    return Boolean(t.api_key && t.env);
  }
  
  return Boolean(t.ws_url && t.ws_login && t.ws_password && t.ws_matricule);
}

export default async function AccountantCabinetPage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const sp = (await searchParams) ?? {};
  const q = s(sp.q);
  const companyFilter = pick(sp.company, ["all", "complete", "incomplete"], "all");
  const ttnFilter = pick(sp.ttn, ["all", "complete", "incomplete"], "all");
  const page = toPage(sp.page);

  const PAGE_SIZE = 10;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: ws } = await supabase
    .from("user_workspace")
    .select("active_group_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const cabinetId = ws?.active_group_id ?? null;
  if (!cabinetId) redirect("/switch");

  const [{ data: cabinet }, { data: me }] = await Promise.all([
    supabase.from("groups").select("id, group_name, group_type, status").eq("id", cabinetId).maybeSingle(),
    supabase
      .from("group_members")
      .select("role, is_active")
      .eq("group_id", cabinetId)
      .eq("user_id", auth.user.id)
      .maybeSingle(),
  ]);

  const cabinetName = cabinet?.group_name ?? "Cabinet";
  const cabinetStatus = String((cabinet as any)?.status ?? "pending");
  const myRole = String((me as any)?.role ?? "");
  const canManage = Boolean((me as any)?.is_active) && (myRole === "owner" || myRole === "admin");

  async function renameCabinet(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) redirect("/login");

    const name = String(formData.get("cabinet_name") ?? "").trim();
    if (!name) redirect("/accountant/cabinet?error=missing_name");

    const { data: ws } = await supabase
      .from("user_workspace")
      .select("active_group_id")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const cabinetId = ws?.active_group_id ?? null;
    if (!cabinetId) redirect("/switch");

    const { data: me } = await supabase
      .from("group_members")
      .select("role, is_active")
      .eq("group_id", cabinetId)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const role = String((me as any)?.role ?? "");
    const ok = Boolean((me as any)?.is_active) && (role === "owner" || role === "admin");
    if (!ok) redirect("/accountant/cabinet?error=forbidden");

    const { error } = await supabase.from("groups").update({ group_name: name }).eq("id", cabinetId);
    if (error) redirect("/accountant/cabinet?error=rename_failed");

    redirect("/accountant/cabinet?ok=1");
  }

  let linksQ = supabase
    .from("group_company_links")
    .select(
      `
      company_id,
      is_active,
      created_at,
      companies:companies(
        id, company_name, tax_id, address, city, postal_code, country
      ),
      ttn:company_ttn_settings(
        company_id,
        connection_type,
        ws_url, ws_login, ws_password, ws_matricule,
        api_key, env
      )
    `,
      { count: "exact" }
    )
    .eq("group_id", cabinetId)
    .eq("is_active", true);

  if (q) {

    linksQ = linksQ.or(
      `companies.company_name.ilike.%${q}%,companies.tax_id.ilike.%${q}%`
    );
  }

  const { data: links, count } = await linksQ.range(from, to);

  const companies = (links ?? [])
    .map((r: any) => r?.companies)
    .filter(Boolean);

  const companyIds = companies.map((c: any) => c.id) as string[];

  const subsByCompany: Record<string, { end: string | null; status: string | null }> = {};
  if (companyIds.length) {
    const { data: subs } = await supabase
      .from("platform_subscriptions")
      .select("scope_id, current_period_end, status")
      .eq("scope_type", "company")
      .in("scope_id", companyIds);

    (subs ?? []).forEach((s: any) => {
      subsByCompany[s.scope_id] = {
        end: s.current_period_end ?? null,
        status: s.status ?? null,
      };
    });
  }

  let assignments: any[] = [];
  if (companyIds.length) {
    const { data } = await supabase
      .from("accountant_company_assignments")
      .select("company_id, user_id, can_view, can_invoice, can_submit_ttn, can_manage_company")
      .eq("group_id", cabinetId)
      .in("company_id", companyIds);

    assignments = data ?? [];
  }

  const userIds = Array.from(new Set(assignments.map((a) => a.user_id))).filter(Boolean) as string[];
  const usersById: Record<string, { full_name: string | null; email: string | null }> = {};

  if (userIds.length) {
    const { data: users } = await supabase
      .from("app_users")
      .select("id, full_name, email")
      .in("id", userIds);

    (users ?? []).forEach((u: any) => {
      usersById[u.id] = { full_name: u.full_name ?? null, email: u.email ?? null };
    });
  }

  const assignmentsByCompany: Record<
    string,
    {
      user_id: string;
      name: string;
      email: string;
      can_invoice: boolean;
      can_submit_ttn: boolean;
      can_manage_company: boolean;
      can_view: boolean;
    }[]
  > = {};

  assignments.forEach((a) => {
    const cid = String(a.company_id);
    const uid = String(a.user_id);
    const u = usersById[uid];
    const name = (u?.full_name || "").trim() || uid.slice(0, 8);
    const email = (u?.email || "").trim() || "—";
    if (!assignmentsByCompany[cid]) assignmentsByCompany[cid] = [];
    assignmentsByCompany[cid].push({
      user_id: uid,
      name,
      email,
      can_view: !!a.can_view,
      can_invoice: !!a.can_invoice,
      can_submit_ttn: !!a.can_submit_ttn,
      can_manage_company: !!a.can_manage_company,
    });
  });

  const rows =
    (links ?? []).map((r: any) => {
      const c = r?.companies;
      const ttn = r?.ttn;
      const companyComplete = isCompanyComplete(c);
      const ttnComplete = isTTNComplete(ttn);
      const sub = c?.id ? subsByCompany[c.id] : null;

      return {
        company_id: c?.id as string,
        company_name: c?.company_name as string,
        tax_id: (c?.tax_id ?? null) as string | null,
        subscription_end: sub?.end ?? null,
        subscription_status: sub?.status ?? null,
        company_complete: companyComplete,
        ttn_complete: ttnComplete,
        managers: assignmentsByCompany[String(c?.id)] ?? [],
      };
    }) ?? [];

  const filtered = rows.filter((it) => {
    if (companyFilter === "complete" && !it.company_complete) return false;
    if (companyFilter === "incomplete" && it.company_complete) return false;
    if (ttnFilter === "complete" && !it.ttn_complete) return false;
    if (ttnFilter === "incomplete" && it.ttn_complete) return false;
    return true;
  });

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="ftn-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="ftn-h2">Mon cabinet</div>
            <div className="ftn-muted mt-1">
              Statut :{" "}
              <span className={cabinetStatus === "validated" ? "ftn-pill ftn-pill-success" : "ftn-pill ftn-pill-warning"}>
                {cabinetStatus === "validated" ? "Validé" : "En attente"}
              </span>
            </div>
          </div>

          <form action={renameCabinet} className="flex items-center gap-2">
            <input
              name="cabinet_name"
              defaultValue={cabinetName}
              className="ftn-input"
              disabled={!canManage}
            />
            <button className="ftn-btn ftn-btn-primary" disabled={!canManage}>
              Modifier
            </button>
          </form>
        </div>
      </div>

      <CabinetClientsTable
        rows={filtered}
        page={page}
        totalPages={totalPages}
        q={q}
        companyFilter={companyFilter}
        ttnFilter={ttnFilter}
        canManage={canManage}
      />
    </div>
  );
}
