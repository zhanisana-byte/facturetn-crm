
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Search = {
  q?: string;
  type?: "all";
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
  const type = (sp.type ?? "all") as Search["type"];
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
    .select("company_id, link_type, subscription_ends_at")
    .eq("group_id", groupId);

  const all = allLinks ?? [];
    
  const now = Date.now();
  const soonMs = 30 * 24 * 60 * 60 * 1000;

  const expiringSoonIds = new Set(
    all
      .filter((l: any) => true && l.subscription_ends_at)
      .filter((l: any) => {
        const t = new Date(l.subscription_ends_at).getTime();
        return Number.isFinite(t) && t - now <= soonMs;
      })
      .map((l: any) => String(l.company_id))
  );

  const { data: externalLinks } = await supabase
    .from("group_companies")
    .select("company_id, link_type, subscription_ends_at, companies(id,company_name,tax_id)")
    .eq("group_id", groupId)
        .order("subscription_ends_at", { ascending: true, nullsFirst: false })
    .limit(200);

  const externalRows = (externalLinks ?? []).map((l: any) => {
    const cid = String(l.companies?.id ?? l.company_id);
    return {
      id: cid,
      name: String(l.companies?.company_name ?? "Société"),
      taxId: String(l.companies?.tax_id ?? "—"),
      subscriptionEndsAt: l.subscription_ends_at as string | null,
      expiringSoon: expiringSoonIds.has(String(l.company_id)),
    };
  });

  let listQ = supabase
    .from("group_companies")
    .select("company_id, link_type, subscription_ends_at, companies(id,company_name,tax_id)", {
      count: "exact",
    })
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (type && type !== "all") listQ = listQ.eq("link_type", type);
  if (q) listQ = listQ.or(`companies.company_name.ilike.%${q}%,companies.tax_id.ilike.%${q}%`);

  const { data: links, count: totalCount } = await listQ.range(from, to);

  const companies = (links ?? []).map((l: any) => {
    const cid = String(l.companies?.id ?? l.company_id);
    return {
      id: cid,
      name: String(l.companies?.company_name ?? "Société"),
      taxId: String(l.companies?.tax_id ?? "—"),
      linkType: "managed",
      subscriptionEndsAt: l.subscription_ends_at as string | null,
      expiringSoon: expiringSoonIds.has(String(l.company_id)),
    };
  });

  const total = Number(totalCount ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const mkUrl = (next: Partial<Search>) => {
    const u = new URLSearchParams();
    const nq = next.q ?? q;
    const nt = next.type ?? type;
    const np = next.page ?? String(page);
    if (nq) u.set("q", nq);
    if (nt && nt !== "all") u.set("type", nt);
    if (np && np !== "1") u.set("page", np);
    const qs = u.toString();
    return qs ? `?${qs}` : "";
  };

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
          <div className="text-xs opacity-70 mt-1">Facturées dans le pack</div>
        </div>
        <div className="ftn-card p-4">
          <div className="text-xs opacity-70">Sociétés gérées</div>
          <div className="text-2xl font-semibold mt-1">{all.length}</div>
          <div className="text-xs opacity-70 mt-1">Acceptées via invitations</div>
        </div>
        <div className="ftn-card p-4">
          <div className="text-xs opacity-70">Expirent bientôt</div>
          <div className="text-2xl font-semibold mt-1">{expiringSoonIds.size}</div>
          <div className="text-xs opacity-70 mt-1">Sociétés gérées uniquement (≤ 30 jours)</div>
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
            <select name="type" defaultValue={type ?? "all"} className="ftn-input" style={{ maxWidth: 200 }}>
              <option value="all">Tous types</option>            </select>
            <button className="ftn-btn" type="submit">
              Filtrer
            </button>
            <Link className="ftn-btn ftn-btn-ghost" href={mkUrl({ q: "", type: "all", page: "1" })} prefetch={false}>
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
                      MF: {c.taxId} • Type: {c.linkType === "managed" ? "Gérée" : "Gérée"}
                      {c.linkType === "managed" ? (
                        <>
                          {" "}
                          • Expire: <b>{fmtDate(c.subscriptionEndsAt)}</b>
                          {c.expiringSoon ? <span className="ml-2 ftn-pill ftn-pill-warn">Bientôt</span> : null}
                        </>
                      ) : null}
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
            <div className="font-semibold">Sociétés gérées — abonnements</div>
            <div className="text-xs opacity-70">Date fin • “Bientôt” = ≤ 30 jours</div>
          </div>
        </div>

        {externalRows.length === 0 ? (
          <div className="ftn-muted mt-2">Aucune société gérée liée pour le moment.</div>
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
                {externalRows.map((c) => (
                  <tr key={`ext-${c.id}`} className="border-b last:border-0">
                    <td className="py-3 pr-3 font-semibold">{c.name}</td>
                    <td className="py-3 pr-3">{c.taxId}</td>
                    <td className="py-3 pr-3">{fmtDate(c.subscriptionEndsAt)}</td>
                    <td className="py-3 pr-3">
                      {c.subscriptionEndsAt ? (
                        c.expiringSoon ? (
                          <span className="ftn-pill ftn-pill-warn">Expire bientôt</span>
                        ) : (
                          <span className="ftn-pill">OK</span>
                        )
                      ) : (
                        <span className="ftn-pill">—</span>
                      )}
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
