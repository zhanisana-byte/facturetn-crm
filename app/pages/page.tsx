import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PermissionBadge from "@/app/components/PermissionBadge";
import DigigoRootRedirect from "../../DigigoRootRedirect";

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

  const { data: memberships } = await query;

  // ✅ Fix TS : memberships peut être null -> on normalise en tableau
  const safeMemberships: any[] = Array.isArray(memberships) ? memberships : [];

  const companies: CompanyMission[] = safeMemberships
    .filter((m: any) => m?.companies?.id)
    .map((m: any) => ({
      id: String(m.companies.id),
      name: String(m.companies.company_name ?? "Société"),
      role: String(m.role ?? "viewer"),
      canCreateInvoices: !!m.can_create_invoices,
      canSubmitTTN: !!m.can_submit_ttn,
      canManageCustomers: !!m.can_manage_customers,
    }));

  const total = companies.length;
  const from = (page - 1) * PAGE_SIZE;
  const to = Math.min(from + PAGE_SIZE, total);
  const visible = companies.slice(from, to);

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      <DigigoRootRedirect />

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-lg font-semibold text-slate-900">Mes entités</div>
        <div className="mt-1 text-sm text-slate-700">
          Permissions{" "}
          <span className="font-semibold text-emerald-700">vert</span> /{" "}
          <span className="font-semibold text-rose-700">rouge</span>
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
            {visible.map((c) => (
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
                    href={`/companies/${encodeURIComponent(c.id)}`}
                    className="rounded-xl bg-black px-3 py-2 text-xs text-white hover:opacity-90"
                  >
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}

            {visible.length === 0 && (
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
