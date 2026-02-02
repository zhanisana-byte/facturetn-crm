import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = {
  q?: string;
  page?: string;
};

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

function toTime(d: string | null | undefined) {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

export default async function GroupDetailPage({
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

  const pageSize = 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  const { data: group } = await supabase
    .from("groups")
    .select("id,group_name,owner_user_id,group_type")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) redirect("/groups/select");

  const isOwner = group.owner_user_id === userId;

  let myRole: string | null = isOwner ? "owner" : null;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    myRole = gm?.role ?? null;
  }

  if (!isOwner && myRole !== "admin") redirect("/groups/select");

  const { data: allLinks } = await supabase
    .from("group_companies")
    .select("company_id, subscription_ends_at")
    .eq("group_id", groupId);

  const all = allLinks ?? [];

  const now = Date.now();
  const soonMs = 30 * 24 * 60 * 60 * 1000;

  const expiringSoonIds = new Set(
    all
      .filter((l: any) => l?.subscription_ends_at)
      .filter((l: any) => {
        const t = toTime(l.subscription_ends_at);
        return t !== null && t - now <= soonMs;
      })
      .map((l: any) => String(l.company_id))
  );

  const nextExpiryTs = all
    .map((l: any) => toTime(l.subscription_ends_at))
    .filter((t: any) => typeof t === "number" && t >= now)
    .sort((a: number, b: number) => a - b)[0] as number | undefined;

  const nextExpiryLabel = nextExpiryTs ? new Date(nextExpiryTs).toLocaleDateString() : "—";

  let listQ = supabase
    .from("group_companies")
    .select("company_id, subscription_ends_at, companies(id,company_name,tax_id)", { count: "exact" })
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (q) listQ = listQ.or(`companies.company_name.ilike.%${q}%,companies.tax_id.ilike.%${q}%`);

  const { data: links, count: totalCount } = await listQ.range(from, to);

  const companies = (links ?? []).map((l: any) => {
    const cid = String(l.companies?.id ?? l.company_id);
    return {
      id: cid,
      name: String(l.companies?.company_name ?? "Société"),
      taxId: String(l.companies?.tax_id ?? "—"),
      subscriptionEndsAt: l.subscription_ends_at as string | null,
      expiringSoon: expiringSoonIds.has(String(l.company_id)),
    };
  });

  const total = Number(totalCount ?? 0);
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

  const { data: expRowsRaw } = await supabase
    .from("group_companies")
    .select("company_id, subscription_ends_at, companies(id,company_name,tax_id)")
    .eq("group_id", groupId)
    .order("subscription_ends_at", { ascending: true, nullsFirst: false })
    .limit(200);

  const expRows = (expRowsRaw ?? []).map((l: any) => {
    const cid = String(l.companies?.id ?? l.company_id);
    const endsAt = l.subscription_ends_at as string | null;
    const expSoon = expiringSoonIds.has(String(l.company_id));
    return {
      id: cid,
      name: String(l.companies?.company_name ?? "Société"),
      taxId: String(l.companies?.tax_id ?? "—"),
      subscriptionEndsAt: endsAt,
      expiringSoon: expSoon,
    };
  });

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">{group.group_name}</div>
            <div className="text-sm opacity-80">
              Rôle : <b>{myRole}</b>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="ftn-btn" href={`/groups/${groupId}/clients`} prefetch={false}>
              Mes sociétés
            </Link>
            <Link className="ftn-btn" href={`/groups/${groupId}/invitations-received`} prefetch={false}>
              Invitations reçues (sociétés)
            </Link>
            <Link className="ftn-btn" href={`/groups/${groupId}/invitations`} prefetch={false}>
              Inviter l’équipe
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="ftn-card p-4">
          <div className="text-xs opacity-70">Sociétés gérées</div>
          <div className="text-2xl font-semibold mt-1">{all.length}</div>
          <div className="text-xs opacity-70 mt-1">Accès actif via rattachement</div>
        </div>
        <div className="ftn-card p-4">
          <div className="text-xs opacity-70">Expirent bientôt</div>
          <div className="text-2xl font-semibold mt-1">{expiringSoonIds.size}</div>
          <div className="text-xs opacity-70 mt-1">Fin abonnement dans 30 jours</div>
        </div>
        <div className="ftn-card p-4">
          <div className="text-xs opacity-70">Prochaine fin d’abonnement</div>
          <div className="text-2xl font-semibold mt-1">{nextExpiryLabel}</div>
          <div className="text-xs opacity-70 mt-1">Date la plus proche</div>
        </div>
      </div>

      <div className="ftn-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-semibold">Sociétés rattachées</div>
            <div className="text-xs opacity-70">
              {total} total • page {page}/{totalPages}
            </div>
          </div>

          <form className="flex flex-wrap gap-2" action={`/groups/${groupId}`} method="get">
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

        {companies.length === 0 ? (
          <div className="ftn-muted mt-2">Aucune société liée pour le moment.</div>
        ) : (
          <div className="mt-3 grid gap-2">
            {companies.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border p-3"
                style={{ borderColor: "rgba(148,163,184,.24)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-xs opacity-70">
                      MF: {c.taxId}
                      {" • "}
                      Fin abonnement: <b>{fmtDate(c.subscriptionEndsAt)}</b>
                      {c.expiringSoon ? <span className="ml-2 ftn-pill ftn-pill-warn">Bientôt</span> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link className="ftn-btn" href={`/groups/${groupId}/companies/${c.id}`} prefetch={false}>
                      Voir (Groupe)
                    </Link>
                    <Link className="ftn-btn" href={`/groups/${groupId}/companies/${c.id}/ttn`} prefetch={false}>
                      TTN
                    </Link>
                    <Link className="ftn-btn" href={`/groups/${groupId}/droits`} prefetch={false}>
                      Accès
                    </Link>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs opacity-70">
                Affichage {from + 1}–{Math.min(to + 1, total)} / {total}
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
        )}
      </div>

      <div className="ftn-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Abonnements des sociétés gérées</div>
            <div className="text-xs opacity-70">Date fin • “Bientôt” = ≤ 30 jours</div>
          </div>
        </div>

        {expRows.length === 0 ? (
          <div className="ftn-muted mt-2">Aucune société liée pour le moment.</div>
        ) : (
          <div className="overflow-auto mt-3">
            <table className="w-full text-sm">
              <thead className="text-left text-xs opacity-70 border-b">
                <tr>
                  <th className="py-2 pr-3">Société</th>
                  <th className="py-2 pr-3">MF</th>
                  <th className="py-2 pr-3">Fin abonnement</th>
                  <th className="py-2 pr-3">Statut</th>
                </tr>
              </thead>
              <tbody>
                {expRows.map((c) => (
                  <tr key={`m-${c.id}`} className="border-b" style={{ borderColor: "rgba(148,163,184,.16)" }}>
                    <td className="py-2 pr-3">{c.name}</td>
                    <td className="py-2 pr-3">{c.taxId}</td>
                    <td className="py-2 pr-3">{fmtDate(c.subscriptionEndsAt)}</td>
                    <td className="py-2 pr-3">
                      {c.expiringSoon ? <span className="ftn-pill ftn-pill-warn">Bientôt</span> : "OK"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
