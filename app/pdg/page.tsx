import { requirePdg, monthKey, weekKey } from "./_lib/pdg";
import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

function money(n: any) {
  const v = Number(n ?? 0);
  if (Number.isNaN(v)) return "0.000";
  return v.toFixed(3);
}

export default async function PdgDashboardPage() {
  const { service } = await requirePdg();

  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const start7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: usersData } = await service
    .from("app_users")
    .select("id,created_at,is_suspended")
    .order("created_at", { ascending: false });
  const users = usersData ?? [];

  const { data: subsData } = await service
    .from("platform_subscriptions")
    .select("id,status,price_ht,quantity")
    .order("created_at", { ascending: false });
  const subs = subsData ?? [];

  const { data: paymentsData } = await service
    .from("platform_payments")
    .select("id,amount_ht,method,paid_at,status,payer_user_id")
    .gte("paid_at", start30.toISOString())
    .order("paid_at", { ascending: false });
  const payments = (paymentsData ?? []).filter((p) => p.status === "paid");

  const monthTotal = payments
    .filter((p) => monthKey(new Date(p.paid_at)) === monthKey(now))
    .reduce((sum, p) => sum + Number(p.amount_ht ?? 0), 0);
  const weekTotal = payments
    .filter((p) => weekKey(new Date(p.paid_at)) === weekKey(now))
    .reduce((sum, p) => sum + Number(p.amount_ht ?? 0), 0);

  const new30 = users.filter((u) => new Date(u.created_at) >= start30).length;
  const new7 = users.filter((u) => new Date(u.created_at) >= start7).length;
  const suspended = users.filter((u) => !!u.is_suspended).length;

  const activeSubs = subs.filter((s) => s.status === "active");
  const mrr = activeSubs.reduce(
    (sum, s) => sum + Number(s.price_ht ?? 0) * Number(s.quantity ?? 1),
    0
  );

  const start120 = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
  const { data: pay120 } = await service
    .from("platform_payments")
    .select("payer_user_id,amount_ht,paid_at,status")
    .gte("paid_at", start120.toISOString());
  const p120 = (pay120 ?? []).filter((p) => p.status === "paid");
  const byUser: Record<string, { count: number; total: number }> = {};
  for (const p of p120) {
    const uid = String(p.payer_user_id);
    byUser[uid] = byUser[uid] || { count: 0, total: 0 };
    byUser[uid].count += 1;
    byUser[uid].total += Number(p.amount_ht ?? 0);
  }
  const loyalIds = Object.entries(byUser)
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10)
    .map(([id]) => id);

  const { data: loyalUsersData } = await service
    .from("app_users")
    .select("id,email,full_name")
    .in("id", loyalIds.length ? loyalIds : ["00000000-0000-0000-0000-000000000000"]);
  const loyalUsers = loyalUsersData ?? [];

  return (
    <AppShell title="Dashboard PDG" subtitle="Pilotage plateforme" accountType="profil" isPdg>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="ftn-card-lux">
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">MRR (HT)</div>
              <div className="ftn-card-sub">Abonnements actifs</div>
            </div>
          </div>
          <div className="ftn-card-body">
            <div className="text-3xl font-extrabold">{money(mrr)} DT</div>
            <div className="text-sm opacity-70">{activeSubs.length} abonnements actifs</div>
          </div>
        </div>

        <div className="ftn-card-lux">
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">Revenu semaine</div>
              <div className="ftn-card-sub">Paiements encaissés</div>
            </div>
          </div>
          <div className="ftn-card-body">
            <div className="text-3xl font-extrabold">{money(weekTotal)} DT</div>
          </div>
        </div>

        <div className="ftn-card-lux">
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">Revenu mois</div>
              <div className="ftn-card-sub">Paiements encaissés</div>
            </div>
          </div>
          <div className="ftn-card-body">
            <div className="text-3xl font-extrabold">{money(monthTotal)} DT</div>
          </div>
        </div>

        <div className="ftn-card-lux">
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">Inscriptions</div>
              <div className="ftn-card-sub">Nouveaux comptes</div>
            </div>
          </div>
          <div className="ftn-card-body">
            <div className="text-2xl font-extrabold">{new7} / 7j</div>
            <div className="text-sm opacity-70">{new30} / 30j</div>
            <div className="text-sm mt-2">Suspendus: <strong>{suspended}</strong></div>
          </div>
        </div>
      </div>

      <div className="ftn-card-lux mt-4">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Clients fidèles (Top 10)</div>
            <div className="ftn-card-sub">≥ 3 paiements sur ~4 mois</div>
          </div>
        </div>
        <div className="ftn-card-body">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2">Client</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Paiements</th>
                  <th className="py-2">Total HT</th>
                </tr>
              </thead>
              <tbody>
                {loyalUsers.map((u) => (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="py-2">{u.full_name || "—"}</td>
                    <td className="py-2">{u.email || "—"}</td>
                    <td className="py-2">{byUser[u.id]?.count ?? 0}</td>
                    <td className="py-2">{money(byUser[u.id]?.total ?? 0)} DT</td>
                  </tr>
                ))}
                {loyalUsers.length === 0 ? (
                  <tr>
                    <td className="py-3 opacity-70" colSpan={4}>
                      Aucun client fidèle détecté pour le moment.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
