import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { LuxCard, ButtonLink, Pill } from "@/app/components/lux/Lux";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export default async function CabinetDashboardPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: me } = await supabase
    .from("app_users")
    .select("id, full_name, email, account_type")
    .eq("id", auth.user.id)
    .single();

  if (!me || !["cabinet", "comptable"].includes(String(me.account_type))) {
    redirect("/dashboard");
  }

  const displayName = me.full_name || (me.email ? me.email.split("@")[0] : "Cabinet");

  // KPIs (best-effort)
  const { data: assigns } = await supabase
    .from("client_assignments")
    .select("company_id")
    .eq("owner_user_id", me.id)
    .eq("is_active", true);

  const clientCompanyIds = Array.from(new Set((assigns ?? []).map((a: any) => a.company_id).filter(Boolean)));

  const { count: clientCount } = await supabase
    .from("client_assignments")
    .select("company_id", { count: "exact", head: true })
    .eq("owner_user_id", me.id)
    .eq("is_active", true);

  const { count: teamPendingCount } = await supabase
    .from("accountant_team_members")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", me.id)
    .eq("status", "pending");

  let pendingValidation = 0;
  let recentInvoices: any[] = [];
  if (clientCompanyIds.length > 0) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("company_id", clientCompanyIds)
      .eq("require_accountant_validation", true)
      .is("accountant_validated_at", null);
    pendingValidation = typeof count === "number" ? count : 0;

    const { data: inv } = await supabase
      .from("invoices")
      .select("id,invoice_number,status,total_ttc,created_at, companies(company_name)")
      .in("company_id", clientCompanyIds)
      .order("created_at", { ascending: false })
      .limit(8);
    recentInvoices = inv ?? [];
  }

  return (
    <AppShell title="Dashboard Cabinet" subtitle="Gestion du cabinet, clients, équipe et TTN" accountType="comptable">
      <div className="ftn-grid">
        <div className="ftn-grid-3">
          <LuxCard
            title="Mon Cabinet"
            subtitle="Identité & informations"
            right={<Pill tone="info">Profil cabinet</Pill>}
            delay={0}
          >
            <div className="text-sm text-slate-700">
              <div className="font-extrabold" style={{ fontSize: 16 }}>{displayName}</div>
              <div className="text-slate-500">Modifier les informations du cabinet et de la société cabinet.</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href="/accountant/profile" variant="primary">Ouvrir</ButtonLink>
              <ButtonLink href="/accountant/team" variant="ghost">Équipe</ButtonLink>
            </div>
          </LuxCard>

          <LuxCard
            title="Paramètres TTN"
            subtitle="TTN de la société du cabinet (obligatoire)"
            right={<Pill tone="warning">À vérifier</Pill>}
            delay={60}
          >
            <div className="text-sm text-slate-600">
              Configure les champs TTN (TEST/PROD) pour la société du cabinet.
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href="/accountant/cabinet/ttn" variant="primary">Configurer TTN</ButtonLink>
            </div>
          </LuxCard>

          <LuxCard
            title="Mes clients"
            subtitle="Sociétés clientes et permissions"
            right={<Pill tone="success">Gestion</Pill>}
            delay={120}
          >
            <div className="text-sm text-slate-600">
              Tableau des clients, qui gère quoi, et droits (factures/TTN/clients…).
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ButtonLink href="/accountant/clients" variant="primary">Voir les clients</ButtonLink>
              <ButtonLink href="/accountant/permissions" variant="ghost">Accès & permissions</ButtonLink>
            </div>
          </LuxCard>
        </div>

        <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "180ms" }}>
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">Raccourcis</div>
              <div className="ftn-card-sub">Les pages principales du cabinet</div>
            </div>
          </div>
          <div className="ftn-card-body">
            <div className="flex flex-wrap gap-2">
              <Link className="ftn-btn-lux ftn-btn-ghost" href="/accountant/team">
                <span className="ftn-btn-shine" aria-hidden="true" />
                <span className="ftn-btn-text">Invitations</span>
              </Link>
              <Link className="ftn-btn-lux ftn-btn-ghost" href="/accountant/roles">
                <span className="ftn-btn-shine" aria-hidden="true" />
                <span className="ftn-btn-text">Rôles</span>
              </Link>
              <Link className="ftn-btn-lux ftn-btn-ghost" href="/subscription">
                <span className="ftn-btn-shine" aria-hidden="true" />
                <span className="ftn-btn-text">Abonnement</span>
              </Link>
              <Link className="ftn-btn-lux ftn-btn-ghost" href="/switch">
                <span className="ftn-btn-shine" aria-hidden="true" />
                <span className="ftn-btn-text">Switch</span>
              </Link>
            </div>
          </div>
          <div className="ftn-card-glow" aria-hidden="true" />
        </div>

        <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "240ms" }}>
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">KPI Cabinet</div>
              <div className="ftn-card-sub">Vue rapide clients & validation</div>
            </div>
          </div>
          <div className="ftn-card-body">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
                <div className="text-xs text-slate-500">Clients actifs</div>
                <div className="font-extrabold">{typeof clientCount === "number" ? clientCount : 0}</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
                <div className="text-xs text-slate-500">Invitations équipe</div>
                <div className="font-extrabold">{typeof teamPendingCount === "number" ? teamPendingCount : 0}</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
                <div className="text-xs text-slate-500">À valider (factures)</div>
                <div className="font-extrabold">{pendingValidation}</div>
              </div>
              <div className="rounded-xl border border-slate-200/60 bg-white/60 p-3">
                <div className="text-xs text-slate-500">Sociétés suivies</div>
                <div className="font-extrabold">{clientCompanyIds.length}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="font-extrabold">Activité récente</div>
              <div className="text-sm text-slate-600">Dernières factures de vos clients (best-effort)</div>
              {recentInvoices.length === 0 ? (
                <div className="ftn-muted mt-2">Aucune facture récente.</div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {recentInvoices.map((r: any) => (
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
              )}
            </div>
          </div>
          <div className="ftn-card-glow" aria-hidden="true" />
        </div>
      </div>
    </AppShell>
  );
}
