import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PermissionBadge from "@/app/components/PermissionBadge";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  cap?: "all" | "invoices" | "customers" | "ttn" | Array<"invoices" | "customers" | "ttn">;
  sort?: "name" | "invoices" | "customers" | "ttn";
  dir?: "asc" | "desc";
  page?: string;
};

type CompanyMission = {
  id: string;
  name: string;
  role: string;
  canCreateInvoices: boolean;
  canSubmitTTN: boolean;
  canManageCustomers: boolean;
  grantedByLabel?: string | null;
};

function clampInt(v: string | undefined, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeCaps(cap: SearchParams["cap"]): Array<"invoices" | "customers" | "ttn"> {
  const allowed = new Set(["invoices", "customers", "ttn"] as const);
  if (!cap || cap === "all") return [];
  const arr = Array.isArray(cap) ? cap : [cap];
  const out: Array<"invoices" | "customers" | "ttn"> = [];
  for (const v of arr) if (allowed.has(v as any)) out.push(v as any);
  return Array.from(new Set(out));
}

function roleRank(role: string) {
  const r = String(role ?? "viewer").toLowerCase();
  if (r === "owner") return 3;
  if (r === "admin") return 2;
  return 1; 
}

function mergeCompany(a: CompanyMission, b: CompanyMission): CompanyMission {
  const bestRole = roleRank(b.role) > roleRank(a.role) ? b.role : a.role;

  const grantedByLabel = a.grantedByLabel || b.grantedByLabel || null;

  return {
    id: a.id,
    name: a.name || b.name,
    role: bestRole,
    canCreateInvoices: Boolean(a.canCreateInvoices || b.canCreateInvoices),
    canSubmitTTN: Boolean(a.canSubmitTTN || b.canSubmitTTN),
    canManageCustomers: Boolean(a.canManageCustomers || b.canManageCustomers),
    grantedByLabel,
  };
}

export default async function PagesIndex(props: { searchParams?: Promise<SearchParams> }) {
  const searchParams = (await props.searchParams) ?? {};
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("account_type")
    .eq("id", auth.user.id)
    .single();

  if (profile?.account_type !== "profil") redirect("/dashboard");

  const q = (searchParams.q ?? "").trim();
  const sort = (searchParams.sort ?? "name") as NonNullable<SearchParams["sort"]>;
  const dir = (searchParams.dir ?? "asc") as NonNullable<SearchParams["dir"]>;
  const page = clampInt(searchParams.page, 1, 1, 999999);

  const caps = normalizeCaps(searchParams.cap);
  const capsSet = new Set(caps);

  const PAGE_SIZE = 25;

  let query = supabase
    .from("memberships")
    .select(
      `
      company_id,
      role,
      can_create_invoices,
      can_submit_ttn,
      can_manage_customers,
      is_active,
      companies (
        id,
        company_name
      )
    `
    )
    .eq("user_id", auth.user.id)
    .eq("is_active", true);

  if (q) query = query.ilike("companies.company_name", `%${q}%`);
  if (capsSet.has("invoices")) query = query.eq("can_create_invoices", true);
  if (capsSet.has("customers")) query = query.eq("can_manage_customers", true);
  if (capsSet.has("ttn")) query = query.eq("can_submit_ttn", true);

  const { data: memberships, error } = await query;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Erreur chargement sociétés : {error.message}
        </div>
      </div>
    );
  }

  const companyIds = Array.from(new Set((memberships ?? []).map((m: any) => m?.company_id).filter(Boolean))) as string[];

  const grantedByByCompany = new Map<string, { invited_by_user_id: string; created_at: string }>();

  if (companyIds.length > 0) {
    const { data: invs } = await supabase
      .from("access_invitations")
      .select("company_id, invited_by_user_id, created_at, status")
      .eq("invited_user_id", auth.user.id)
      .in("company_id", companyIds)
      .eq("status", "accepted");

    (invs ?? []).forEach((inv: any) => {
      const cid = String(inv.company_id);
      const cur = grantedByByCompany.get(cid);
      const ts = String(inv.created_at ?? "");
      if (!cur || ts > cur.created_at) {
        grantedByByCompany.set(cid, { invited_by_user_id: String(inv.invited_by_user_id), created_at: ts });
      }
    });
  }

  const invitedByIds = Array.from(new Set(Array.from(grantedByByCompany.values()).map((x) => x.invited_by_user_id).filter(Boolean))) as string[];

  const invitedByMap = new Map<string, string>();
  if (invitedByIds.length > 0) {
    const { data: inviters } = await supabase.from("app_users").select("id, full_name, email, account_type").in("id", invitedByIds);

    (inviters ?? []).forEach((u: any) => {
      const name = String(u.full_name ?? "").trim() || String(u.email ?? "Utilisateur");
      const type =
        u.account_type === "cabinet"
          ? "Cabinet"
          : u.account_type === "groupe"
          ? "Groupe"
          : u.account_type === "societe"
          ? "Société"
          : u.account_type === "profil"
          ? "Profil"
          : "Compte";
      invitedByMap.set(String(u.id), `${name} (${type})`);
    });
  }

  const map = new Map<string, CompanyMission>();

  (memberships ?? []).forEach((m: any) => {
    const c = m?.companies;
    if (!c?.id) return;

    const cid = String(c.id);
    const role = String(m.role ?? "viewer");

    const g = grantedByByCompany.get(cid);
    const grantedByLabel = g ? invitedByMap.get(g.invited_by_user_id) ?? "Utilisateur" : null;

    const row: CompanyMission = {
      id: cid,
      name: String(c.company_name ?? "Société"),
      role,
      canCreateInvoices: Boolean(m.can_create_invoices),
      canSubmitTTN: Boolean(m.can_submit_ttn),
      canManageCustomers: Boolean(m.can_manage_customers),
      grantedByLabel,
    };

    const cur = map.get(cid);
    map.set(cid, cur ? mergeCompany(cur, row) : row);
  });

  let companies = Array.from(map.values());

  const asc = dir !== "desc";
  companies.sort((a, b) => {
    const mul = asc ? 1 : -1;

    if (sort === "name") return mul * a.name.localeCompare(b.name, "fr");
    if (sort === "invoices") return mul * (Number(a.canCreateInvoices) - Number(b.canCreateInvoices));
    if (sort === "customers") return mul * (Number(a.canManageCustomers) - Number(b.canManageCustomers));
    return mul * (Number(a.canSubmitTTN) - Number(b.canSubmitTTN));
  });

  const total = companies.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = Math.min(from + PAGE_SIZE, total);
  companies = companies.slice(from, to);

  const baseParams = {
    q: q || undefined,
    sort: sort !== "name" ? sort : undefined,
    dir: dir !== "asc" ? dir : undefined,
  };

  const buildHref = (p: Record<string, string | undefined>, capValues: Array<"invoices" | "customers" | "ttn">) => {
    const sp = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => {
      if (v !== undefined && v !== "") sp.set(k, v);
    });
    for (const v of capValues) sp.append("cap", v);
    const s = sp.toString();
    return s ? `?${s}` : "";
  };

  const sortLink = (s: NonNullable<SearchParams["sort"]>) => {
    const nextDir = sort === s && dir === "asc" ? "desc" : "asc";
    return `/pages${buildHref(
      {
        ...baseParams,
        sort: s === "name" ? undefined : s,
        dir: nextDir === "asc" ? undefined : nextDir,
        page: "1",
      },
      caps
    )}`;
  };

  const hasPrev = safePage > 1;
  const hasNext = safePage < totalPages;

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-lg font-semibold text-slate-900">Mes entités</div>
        <div className="mt-1 text-sm text-slate-700">
          Permissions <span className="font-semibold text-emerald-700">vert</span> /{" "}
          <span className="font-semibold text-rose-700">rouge</span>.
        </div>
      </div>

      {}
      <form className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-600">Recherche société</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Ex: Sana SARL"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div>
          <div className="text-xs font-medium text-slate-600">Filtre permission</div>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="cap" value="invoices" defaultChecked={capsSet.has("invoices")} className="h-4 w-4" />
              Factures
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="cap" value="customers" defaultChecked={capsSet.has("customers")} className="h-4 w-4" />
              Clients
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="cap" value="ttn" defaultChecked={capsSet.has("ttn")} className="h-4 w-4" />
              TTN
            </label>
          </div>
        </div>

        <input type="hidden" name="sort" value={sort} />
        <input type="hidden" name="dir" value={dir} />

        <button className="h-10 rounded-xl bg-black px-4 text-sm text-white">Filtrer</button>

        <Link href="/pages" className="h-10 rounded-xl border border-slate-200 px-4 text-sm flex items-center justify-center hover:bg-slate-50">
          Reset
        </Link>
      </form>

      {}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="text-sm font-semibold">Sociétés</div>
          <div className="text-xs text-slate-500">
            {total} résultat(s) • Page {safePage}/{totalPages}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left font-medium px-4 py-3">
                  <Link className="hover:underline" href={sortLink("name")}>
                    Société {sort === "name" ? (dir === "asc" ? "▲" : "▼") : ""}
                  </Link>
                </th>
                <th className="text-left font-medium px-4 py-3 w-[360px]">Permissions</th>
                <th className="text-right font-medium px-4 py-3 w-[320px]">Actions</th>
              </tr>
            </thead>

            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.role === "owner"
                        ? "Créée par vous"
                        : c.grantedByLabel
                        ? `Accès accordé par ${c.grantedByLabel}`
                        : "Accès accordé"}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <PermissionBadge ok={c.canCreateInvoices} label="Factures" />
                      <PermissionBadge ok={c.canManageCustomers} label="Clients" />
                      <PermissionBadge ok={c.canSubmitTTN} label="TTN" />
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-2">
                      <Link
                        href={`/invoices?company=${encodeURIComponent(c.id)}`}
                        className={[
                          "rounded-xl border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50",
                          c.canCreateInvoices ? "" : "pointer-events-none opacity-40",
                        ].join(" ")}
                        aria-disabled={!c.canCreateInvoices}
                      >
                        Factures
                      </Link>

                      <Link
                        href={`/clients?company=${encodeURIComponent(c.id)}`}
                        className={[
                          "rounded-xl border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50",
                          c.canManageCustomers ? "" : "pointer-events-none opacity-40",
                        ].join(" ")}
                        aria-disabled={!c.canManageCustomers}
                      >
                        Clients
                      </Link>

                      <Link
                        href={`/companies/${encodeURIComponent(c.id)}/ttn`}
                        className={[
                          "rounded-xl border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50",
                          c.canSubmitTTN ? "" : "pointer-events-none opacity-40",
                        ].join(" ")}
                        aria-disabled={!c.canSubmitTTN}
                      >
                        TTN
                      </Link>

                      <Link
                        href={`/companies/${encodeURIComponent(c.id)}`}
                        className="rounded-xl bg-black px-3 py-2 text-xs text-white hover:opacity-90"
                      >
                        Ouvrir
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}

              {companies.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-600">
                    Aucun résultat.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Affichage {total === 0 ? 0 : from + 1}–{to} / {total}
          </div>

          <div className="flex items-center gap-2">
            <Link
              className={[
                "rounded-xl border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50",
                hasPrev ? "" : "pointer-events-none opacity-40",
              ].join(" ")}
              href={`/pages${buildHref({ ...baseParams, page: String(safePage - 1) }, caps)}`}
            >
              ← Précédent
            </Link>

            <Link
              className={[
                "rounded-xl border border-slate-200 px-3 py-2 text-xs hover:bg-slate-50",
                hasNext ? "" : "pointer-events-none opacity-40",
              ].join(" ")}
              href={`/pages${buildHref({ ...baseParams, page: String(safePage + 1) }, caps)}`}
            >
              Suivant →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
