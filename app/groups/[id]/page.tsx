import Link from "next/link";
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

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function inLastDays(iso: string | null, days: number) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}

export default async function GroupDetailPage({ params }: PageProps) {
  const { id  } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase);

  // Stabiliser le contexte: forcer le workspace Groupe (sidebar fixe)
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

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("id,group_name,owner_user_id,created_at")
    .eq("id", id)
    .single();

  if (groupErr || !group) {
    return (
      <AppShell title="Groupe" subtitle="Détails" accountType={shellTypeFromWorkspace("multi_societe")} activeGroupId={id}>
        <div className="ftn-alert">Groupe introuvable: {groupErr?.message}</div>
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

  const { data: links, error: linkErr } = await supabase
    .from("group_companies")
    .select("company_id, link_type, companies(id,company_name,tax_id)")
    .eq("group_id", id)
    .order("created_at", { ascending: false });

  const hasLinks = !linkErr;
  const companies =
    (links ?? []).map((l: any) => ({
      id: l.companies?.id ?? l.company_id,
      name: l.companies?.company_name ?? "Société",
      taxId: l.companies?.tax_id ?? "—",
      linkType: l.link_type ?? "internal",
    })) ?? [];

  // KPIs (best-effort) : invoices across linked companies (last 30 days)
  const companyIds = companies.map((c) => c.id).filter(Boolean);
  let inv30: Array<any> = [];
  if (companyIds.length > 0) {
    const { data: invRows } = await supabase
      .from("invoices")
      .select("id,company_id,invoice_number,status,total_ttc,created_at, companies(company_name)")
      .in("company_id", companyIds)
      .gte("created_at", daysAgoISO(30))
      .order("created_at", { ascending: false })
      .limit(500);
    inv30 = (invRows ?? []) as any[];
  }

  const monthCount = inv30.length;
  const monthSum = inv30.reduce((s, r) => s + Number(r.total_ttc ?? 0), 0);
  const weekInv = inv30.filter((r) => inLastDays(r.created_at ?? null, 7));
  const weekCount = weekInv.length;
  const weekSum = weekInv.reduce((s, r) => s + Number(r.total_ttc ?? 0), 0);
  const pendingStatuses = new Set(["draft", "validated", "ready_to_send", "sent_ttn", "rejected_ttn"]);
  const pendingCount = inv30.filter((r) => pendingStatuses.has(String(r.status ?? ""))).length;
  const recentInv = inv30.slice(0, 8);

  // (end KPI)

  return (
    <AppShell
      title={group.group_name}
      subtitle="Espace Groupe"
      accountType={shellTypeFromWorkspace("multi_societe")}
      activeGroupId={id}
    >
      <div className="ftn-grid">
        <div className="ftn-grid-3">
          <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "0ms" }}>
            <div className="ftn-card-head">
              <div>
                <div className="ftn-card-title">Sociétés</div>
                <div className="ftn-card-sub">Sociétés rattachées au groupe</div>
              </div>
              <div className="ftn-card-right">
                <Badge>{hasLinks ? companies.length : "—"}</Badge>
              </div>
            </div>
            <div className="ftn-card-body text-sm text-slate-600">
              Gestion des sociétés internes & externes du groupe.
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="ftn-btn-lux ftn-btn-primary" href={`/groups/${id}/clients`}>
                  <span className="ftn-btn-shine" aria-hidden="true" />
                  <span className="ftn-btn-text">Mes clients</span>
                </Link>
                <Link className="ftn-btn-lux ftn-btn-ghost" href={`/companies/create`}>
                  <span className="ftn-btn-shine" aria-hidden="true" />
                  <span className="ftn-btn-text">+ Créer société</span>
                </Link>
              </div>
            </div>
            <div className="ftn-card-glow" aria-hidden="true" />
          </div>

          <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "30ms" }}>
            <div className="ftn-card-head">
              <div>
                <div className="ftn-card-title">KPI Facturation</div>
                <div className="ftn-card-sub">Agrégat sur toutes les sociétés (30j)</div>
              </div>
              <div className="ftn-card-right">
                <Badge>{monthCount}</Badge>
              </div>
            </div>
            <div className="ftn-card-body text-sm text-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
                  <div className="text-xs text-slate-500">CA 30j</div>
                  <div className="font-extrabold">{money(monthSum)} TND</div>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
                  <div className="text-xs text-slate-500">CA 7j</div>
                  <div className="font-extrabold">{money(weekSum)} TND</div>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
                  <div className="text-xs text-slate-500">Factures 7j</div>
                  <div className="font-extrabold">{weekCount}</div>
                </div>
                <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
                  <div className="text-xs text-slate-500">En attente TTN</div>
                  <div className="font-extrabold">{pendingCount}</div>
                </div>
              </div>
              <div className="mt-3">
                <Link className="ftn-btn-lux ftn-btn-ghost" href={`/groups/${id}/clients`}>
                  <span className="ftn-btn-shine" aria-hidden="true" />
                  <span className="ftn-btn-text">Voir sociétés</span>
                </Link>
              </div>
            </div>
            <div className="ftn-card-glow" aria-hidden="true" />
          </div>

          <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "60ms" }}>
            <div className="ftn-card-head">
              <div>
                <div className="ftn-card-title">Rôles & accès</div>
                <div className="ftn-card-sub">Qui gère le groupe</div>
              </div>
              <div className="ftn-card-right">
                <Badge>{myRole || "—"}</Badge>
              </div>
            </div>
            <div className="ftn-card-body text-sm text-slate-600">
              Gère les rôles (owner/admin) et les accès des membres.
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="ftn-btn-lux ftn-btn-primary" href={`/groups/roles`}>
                  <span className="ftn-btn-shine" aria-hidden="true" />
                  <span className="ftn-btn-text">Ouvrir rôles</span>
                </Link>
                <Link className="ftn-btn-lux ftn-btn-ghost" href={`/groups/invitations`}>
                  <span className="ftn-btn-shine" aria-hidden="true" />
                  <span className="ftn-btn-text">Invitations</span>
                </Link>
              </div>
            </div>
            <div className="ftn-card-glow" aria-hidden="true" />
          </div>

          <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "120ms" }}>
            <div className="ftn-card-head">
              <div>
                <div className="ftn-card-title">Abonnement</div>
                <div className="ftn-card-sub">Gestion au niveau du groupe</div>
              </div>
            </div>
            <div className="ftn-card-body text-sm text-slate-600">
              Suivi de l’abonnement, paiements et statut.
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="ftn-btn-lux ftn-btn-primary" href={`/subscription`}>
                  <span className="ftn-btn-shine" aria-hidden="true" />
                  <span className="ftn-btn-text">Voir abonnement</span>
                </Link>
                <Link className="ftn-btn-lux ftn-btn-ghost" href={`/switch`}>
                  <span className="ftn-btn-shine" aria-hidden="true" />
                  <span className="ftn-btn-text">Switch</span>
                </Link>
              </div>
            </div>
            <div className="ftn-card-glow" aria-hidden="true" />
          </div>

          <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "180ms" }}>
            <div className="ftn-card-head">
              <div>
                <div className="ftn-card-title">KPI Groupe</div>
                <div className="ftn-card-sub">Factures & activité (30j)</div>
              </div>
            </div>
            <div className="ftn-card-body text-sm text-slate-600">
              <div className="grid gap-2">
                <div className="flex items-center justify-between"><span>CA (30j)</span><Badge>{money(monthSum)} TND</Badge></div>
                <div className="flex items-center justify-between"><span>Factures (30j)</span><Badge>{monthCount}</Badge></div>
                <div className="flex items-center justify-between"><span>CA (7j)</span><Badge>{money(weekSum)} TND</Badge></div>
                <div className="flex items-center justify-between"><span>Factures (7j)</span><Badge>{weekCount}</Badge></div>
                <div className="flex items-center justify-between"><span>En attente TTN</span><Badge>{pendingCount}</Badge></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="ftn-btn-lux ftn-btn-ghost" href={`/accountant/invoices`}>
                  <span className="ftn-btn-shine" aria-hidden="true" />
                  <span className="ftn-btn-text">Voir activité</span>
                </Link>
              </div>
            </div>
            <div className="ftn-card-glow" aria-hidden="true" />
          </div>
        </div>

        <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "240ms" }}>
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">Sociétés du groupe</div>
              <div className="ftn-card-sub">Accès rapide aux sociétés rattachées</div>
            </div>
          </div>
          <div className="ftn-card-body">
            {recentInv.length > 0 ? (
              <div className="mb-4 rounded-2xl border border-slate-200/60 bg-white/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-extrabold">Activité récente (factures)</div>
                    <div className="text-sm text-slate-600">Dernières factures sur les sociétés du groupe</div>
                  </div>
                  <span className="ftn-badge">{recentInv.length}</span>
                </div>
                <div className="mt-3 grid gap-2">
                  {recentInv.map((r: any) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/60 bg-white/70 p-3">
                      <div>
                        <div className="font-semibold">{r.invoice_number || "Facture"}</div>
                        <div className="text-xs text-slate-600">
                          {r.companies?.company_name ? `${r.companies.company_name} · ` : ""}Statut: {r.status || "—"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="ftn-badge">{money(r.total_ttc)} TND</span>
                        <Link className="ftn-btn-lux ftn-btn-ghost" href={`/invoices/${r.id}`}>
                          <span className="ftn-btn-shine" aria-hidden="true" />
                          <span className="ftn-btn-text">Ouvrir</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {!hasLinks ? (
              <div className="ftn-alert">
                La table <b>group_companies</b> n&apos;existe pas encore. Ajoute ton SQL puis recharge.
              </div>
            ) : companies.length === 0 ? (
              <div className="ftn-muted">
                Aucune société liée. Clique sur <Link className="ftn-link" href={`/companies/create`}>Créer une société</Link> puis rattache-la au groupe.
              </div>
            ) : (
              <div className="grid gap-2">
                {companies.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-slate-200/60 bg-white/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-extrabold">{c.name}</div>
                        <div className="text-sm text-slate-600">MF: {c.taxId}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge>{c.linkType === "external" ? "Externe" : "Interne"}</Badge>
                        <Link className="ftn-btn-lux ftn-btn-ghost" href={`/companies/${c.id}`}>
                          <span className="ftn-btn-shine" aria-hidden="true" />
                          <span className="ftn-btn-text">Gestion</span>
                        </Link>
                        <Link className="ftn-btn-lux ftn-btn-ghost" href={`/companies/${c.id}/ttn`}>
                          <span className="ftn-btn-shine" aria-hidden="true" />
                          <span className="ftn-btn-text">TTN</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ftn-card-glow" aria-hidden="true" />
        </div>

      </div>
    </AppShell>
  );
}
