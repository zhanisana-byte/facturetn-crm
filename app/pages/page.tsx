import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PermissionBadge from "@/app/components/PermissionBadge";
import DigigoRootRedirect from "@/app/DigigoRootRedirect";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  cap?:
    | "all"
    | "invoices"
    | "customers"
    | "ttn"
    | Array<"invoices" | "customers" | "ttn">;
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

function normalizeCaps(
  cap: SearchParams["cap"]
): Array<"invoices" | "customers" | "ttn"> {
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

  return {
    id: a.id,
    name: a.name || b.name,
    role: bestRole,
    canCreateInvoices: a.canCreateInvoices || b.canCreateInvoices,
    canSubmitTTN: a.canSubmitTTN || b.canSubmitTTN,
    canManageCustomers: a.canManageCustomers || b.canManageCustomers,
    grantedByLabel: a.grantedByLabel || b.grantedByLabel || null,
  };
}

export default async function PagesIndex(props: {
  searchParams?: Promise<SearchParams>;
}) {
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
  const sort = (searchParams.sort ?? "name") as NonNullable<
    SearchParams["sort"]
  >;
  const dir = (searchParams.dir ?? "asc") as NonNullable<
    SearchParams["dir"]
  >;
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

  const { data: memberships = [] } = await query;

  const map = new Map<string, CompanyMission>();

  memberships.forEach((m: any) => {
    if (!m?.companies?.id) return;

    const row: CompanyMission = {
      id: m.companies.id,
      name: m.companies.company_name,
      role: m.role ?? "viewer",
      canCreateInvoices: !!m.can_create_invoices,
      canSubmitTTN: !!m.can_submit_ttn,
      canManageCustomers: !!m.can_manage_customers,
    };

    const cur = map.get(row.id);
    map.set(row.id, cur ? mergeCompany(cur, row) : row);
  });

  let companies = Array.from(map.values());

  const asc = dir !== "desc";
  companies.sort((a, b) => {
    const mul = asc ? 1 : -1;
    if (sort === "name") return mul * a.name.localeCompare(b.name, "fr");
    if (sort === "invoices")
      return mul * (Number(a.canCreateInvoices) - Number(b.canCreateInvoices));
    if (sort === "customers")
      return mul *
        (Number(a.canManageCustomers) - Number(b.canManageCustomers));
    return mul * (Number(a.canSubmitTTN) - Number(b.canSubmitTTN));
  });

  const total = companies.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * PAGE_SIZE;
  const to = Math.min(from + PAGE_SIZE, total);
  companies = companies.slice(from, to);

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      {/* 🔥 REDIRECTION DIGIGO (NE PAS SUPPRIMER) */}
      <DigigoRootRedirect />

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-lg font-semibold text-slate-900">Mes entités</div>
        <div className="mt-1 text-sm text-slate-700">
          Permissions{" "}
          <span className="font-semibold text-emerald-700">vert</span> /{" "}
          <span className="font-semibold text-rose-700">rouge</span>.
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-3">Société</th>
              <th className="text-left px-4 py-3">Permissions</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-t hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <PermissionBadge ok={c.canCreateInvoices} label="Factures" />
                    <PermissionBadge ok={c.canManageCustomers} label="Clients" />
                    <PermissionBadge ok={c.canSubmitTTN} label="TTN" />
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/companies/${c.id}`}
                    className="rounded-xl bg-black px-3 py-2 text-xs text-white"
                  >
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
            {companies.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-8 text-center text-slate-600"
                >
                  Aucune société.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
