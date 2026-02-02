import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = { q?: string; page?: string };

function asInt(v: string | undefined, fallback = 1) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return "—";
  }
}

export default async function GroupClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Search>;
}) {
  const { id: groupId } = await params;
  const sp = (await searchParams) ?? {};
  const q = String(sp.q ?? "").trim();
  const page = asInt(sp.page, 1);

  const pageSize = 12;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: group } = await supabase
    .from("groups")
    .select("id, group_name, owner_user_id")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) redirect("/groups/select");

  const isOwner = group.owner_user_id === auth.user.id;

  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (gm?.role !== "admin") redirect("/groups/select");
  }

  let listQ = supabase
    .from("group_companies")
    .select("company_id, subscription_ends_at, companies(id, company_name, tax_id)", { count: "exact" })
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (q) listQ = listQ.or(`companies.company_name.ilike.%${q}%,companies.tax_id.ilike.%${q}%`);

  const { data: links, count } = await listQ.range(from, to);

  const items = (links ?? []).map((l: any) => ({
    companyId: String(l?.companies?.id ?? l?.company_id),
    type: "managed" as const,
    subscriptionEndsAt: (l?.subscription_ends_at ?? null) as string | null,
    company: l?.companies ?? null,
  }));

  const total = Number(count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const mkUrl = (next: Partial<Search>) => {
    const u = new URLSearchParams();
    const nq = next.q ?? q;
    const np = next.page ?? String(page);
    if (nq) u.set("q", nq);
    if (np && np !== "1") u.set("page", np);
    const qs = u.toString();
    return qs ? `?${qs}` : "";
  };

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-semibold">{group.group_name}</div>
          <div className="text-sm opacity-80">Sociétés gérées</div>
        </div>
        <form className="flex gap-2 flex-wrap" action={`/groups/${groupId}/clients`} method="get">
          <input type="hidden" name="page" value="1" />
          <input name="q" defaultValue={q} className="ftn-input" placeholder="Rechercher (nom / MF)" />
          <button className="ftn-btn" type="submit">
            Filtrer
          </button>
          <Link className="ftn-btn ftn-btn-ghost" href={mkUrl({ q: "", page: "1" })} prefetch={false}>
            Reset
          </Link>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="ftn-card p-4">
          <div className="ftn-muted">Aucune société liée pour le moment.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((it) => (
            <div key={it.companyId} className="ftn-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{String(it.company?.company_name ?? "Société")}</div>
                  <div className="text-xs opacity-70">
                    MF: {String(it.company?.tax_id ?? "—")} • Fin abonnement: <b>{fmtDate(it.subscriptionEndsAt)}</b>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Link className="ftn-btn" href={`/groups/${groupId}/companies/${it.companyId}`} prefetch={false}>
                    Ouvrir
                  </Link>
                  <Link className="ftn-btn" href={`/groups/${groupId}/companies/${it.companyId}/ttn`} prefetch={false}>
                    TTN
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs opacity-70">
          Page {page}/{totalPages} • {total} sociétés
        </div>
        <div className="flex gap-2">
          <Link
            className={`ftn-btn ftn-btn-ghost ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
            href={mkUrl({ page: String(Math.max(1, page - 1)) })}
            prefetch={false}
          >
            Précédent
          </Link>
          <Link
            className={`ftn-btn ftn-btn-ghost ${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
            href={mkUrl({ page: String(Math.min(totalPages, page + 1)) })}
            prefetch={false}
          >
            Suivant
          </Link>
        </div>
      </div>
    </div>
  );
}
