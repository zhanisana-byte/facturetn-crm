import AppShell from "@/app/components/AppShell";
import { requirePdg, monthKey, weekKey } from "../_lib/pdg";

export const dynamic = "force-dynamic";

function money(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

type Bucket = { key: string; total: number; count: number; byMethod: Record<string, number> };

export default async function PdgReportsPage() {
  const { service } = await requirePdg();

  const now = new Date();
  const start180 = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const { data: payData } = await service
    .from("platform_payments")
    .select("payer_user_id,amount_ht,method,paid_at,status")
    .gte("paid_at", start180.toISOString())
    .order("paid_at", { ascending: false });

  const payments = (payData ?? []).filter((p) => p.status === "paid");

  const byMonth: Record<string, Bucket> = {};
  const byWeek: Record<string, Bucket> = {};
  const payCountByUser: Record<string, number> = {};

  for (const p of payments) {
    const amt = Number(p.amount_ht ?? 0);
    const m = monthKey(new Date(p.paid_at));
    const w = weekKey(new Date(p.paid_at));

    byMonth[m] = byMonth[m] || { key: m, total: 0, count: 0, byMethod: {} };
    byMonth[m].total += amt;
    byMonth[m].count += 1;
    byMonth[m].byMethod[p.method] = (byMonth[m].byMethod[p.method] || 0) + amt;

    byWeek[w] = byWeek[w] || { key: w, total: 0, count: 0, byMethod: {} };
    byWeek[w].total += amt;
    byWeek[w].count += 1;
    byWeek[w].byMethod[p.method] = (byWeek[w].byMethod[p.method] || 0) + amt;

    const uid = String(p.payer_user_id);
    payCountByUser[uid] = (payCountByUser[uid] || 0) + 1;
  }

  const months = Object.values(byMonth).sort((a, b) => a.key.localeCompare(b.key));
  const weeks = Object.values(byWeek).sort((a, b) => a.key.localeCompare(b.key));

  const loyalIds = Object.entries(payCountByUser)
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([id]) => id);

  const { data: loyalUsersData } = await service
    .from("app_users")
    .select("id,email,full_name")
    .in("id", loyalIds.length ? loyalIds : ["00000000-0000-0000-0000-000000000000"]);
  const loyalUsers = loyalUsersData ?? [];

  return (
    <AppShell title="PDG — Rapports" subtitle="CA / Semaine / Fidélité" accountType="profil" isPdg>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="ftn-card-lux">
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">Chiffre (HT) par mois</div>
              <div className="ftn-card-sub">Basé sur les paiements (encaissés)</div>
            </div>
          </div>
          <div className="ftn-card-body">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left opacity-70">
                    <th className="py-2">Mois</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">#</th>
                    <th className="py-2">Cash</th>
                    <th className="py-2">Virement</th>
                    <th className="py-2">Versement</th>
                    <th className="py-2">Free</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((b) => (
                    <tr key={b.key} className="border-t border-white/10">
                      <td className="py-2">{b.key}</td>
                      <td className="py-2 font-semibold">{money(b.total)} DT</td>
                      <td className="py-2">{b.count}</td>
                      <td className="py-2">{money(b.byMethod.cash ?? 0)}</td>
                      <td className="py-2">{money(b.byMethod.virement ?? 0)}</td>
                      <td className="py-2">{money(b.byMethod.versement ?? 0)}</td>
                      <td className="py-2">{money(b.byMethod.free ?? 0)}</td>
                    </tr>
                  ))}
                  {months.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-3 opacity-70">Aucune donnée.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="ftn-card-lux">
          <div className="ftn-card-head">
            <div>
              <div className="ftn-card-title">Chiffre (HT) par semaine</div>
              <div className="ftn-card-sub">Derniers 6 mois</div>
            </div>
          </div>
          <div className="ftn-card-body">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left opacity-70">
                    <th className="py-2">Semaine</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">#</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((b) => (
                    <tr key={b.key} className="border-t border-white/10">
                      <td className="py-2">{b.key}</td>
                      <td className="py-2 font-semibold">{money(b.total)} DT</td>
                      <td className="py-2">{b.count}</td>
                    </tr>
                  ))}
                  {weeks.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-3 opacity-70">Aucune donnée.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="ftn-card-lux mt-4">
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Clients fidèles</div>
            <div className="ftn-card-sub">Définition V1 : ≥ 3 paiements sur ~6 mois</div>
          </div>
        </div>
        <div className="ftn-card-body">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left opacity-70">
                  <th className="py-2">Client</th>
                  <th className="py-2">Email</th>
                  <th className="py-2"># paiements</th>
                </tr>
              </thead>
              <tbody>
                {loyalUsers.map((u) => (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="py-2">{u.full_name || "—"}</td>
                    <td className="py-2">{u.email || "—"}</td>
                    <td className="py-2">{payCountByUser[u.id] ?? 0}</td>
                  </tr>
                ))}
                {loyalUsers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-3 opacity-70">Aucun client fidèle.</td>
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
