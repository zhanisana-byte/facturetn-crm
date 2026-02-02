import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LuxCard, ButtonLink, Pill, StatRow } from "@/app/components/lux/Lux";

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  status: string | null;
  total_ttc: number | null;
  created_at: string | null;
};

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

export default async function CompanyDashboard({ companyId }: { companyId: string }) {
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name, tax_id")
    .eq("id", companyId)
    .single();

  const { data: ttn } = await supabase
    .from("company_ttn_settings")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle();

  const { data: invoices30 } = await supabase
    .from("invoices")
    .select("id,invoice_number,status,total_ttc,created_at")
    .eq("company_id", companyId)
    .gte("created_at", daysAgoISO(30))
    .order("created_at", { ascending: false })
    .limit(500);

  const inv = (invoices30 ?? []) as InvoiceRow[];

  const monthCount = inv.length;
  const monthSum = inv.reduce((s, r) => s + Number(r.total_ttc ?? 0), 0);

  const weekInv = inv.filter((r) => inLastDays(r.created_at, 7));
  const weekCount = weekInv.length;
  const weekSum = weekInv.reduce((s, r) => s + Number(r.total_ttc ?? 0), 0);

  const pendingStatuses = new Set(["draft", "validated", "ready_to_send", "sent_ttn", "rejected_ttn"]);
  const pendingCount = inv.filter((r) => pendingStatuses.has(String(r.status ?? ""))).length;
  const acceptedCount = inv.filter((r) => String(r.status) === "accepted_ttn").length;

  const statusCounts = inv.reduce<Record<string, number>>((acc, r) => {
    const k = String(r.status ?? "unknown");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const recent = inv.slice(0, 8);

  const ttnOk = !!ttn?.id;

  return (
    <div className="ftn-grid">
      <div className="ftn-grid-3">
        <LuxCard
          title={company?.company_name || "Société"}
          subtitle={company?.tax_id ? `Matricule: ${company.tax_id}` : "Matricule: —"}
          right={
            ttnOk ? <Pill tone="success">TTN: OK</Pill> : <Pill tone="warning">TTN: manquant</Pill>
          }
          delay={0}
        >
          <StatRow label="Factures (30j)" value={monthCount} />
          <StatRow label="CA (30j)" value={`${money(monthSum)} TND`} />
          <StatRow label="Factures (7j)" value={weekCount} />
          <StatRow label="CA (7j)" value={`${money(weekSum)} TND`} />
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/companies/edit/${companyId}`} variant="primary">
              Modifier
            </ButtonLink>
            <ButtonLink href={`/companies/${companyId}/droits`} variant="ghost">
              Rôles
            </ButtonLink>
          </div>
        </LuxCard>

        <LuxCard title="Flux TTN" subtitle="Statuts & conformité" delay={60}>
          <StatRow label="En attente" value={pendingCount} />
          <StatRow label="Acceptées" value={acceptedCount} />
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/companies/${companyId}/ttn`} variant={ttnOk ? "ghost" : "primary"}>
              {ttnOk ? "Voir TTN" : "Configurer TTN"}
            </ButtonLink>
          </div>
        </LuxCard>

        <LuxCard title="Facturation" subtitle="Disponible depuis le Profil" delay={120}>
          <div className="text-sm text-slate-600">
            La facturation est exécutée uniquement depuis le Profil. Utilisez Switch pour revenir au Profil.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href={`/switch`} variant="primary">
              Aller au Switch
            </ButtonLink>
          </div>
        </LuxCard>
      </div>

      <div className="ftn-card-lux ftn-reveal" style={{ animationDelay: "180ms" }}>
        <div className="ftn-card-head">
          <div>
            <div className="ftn-card-title">Activité récente</div>
            <div className="ftn-card-sub">Dernières factures et statuts</div>
          </div>
          <div className="ftn-card-right">
            <span className="ftn-badge">{Object.keys(statusCounts).length} statuts</span>
          </div>
        </div>
        <div className="ftn-card-body">
          {recent.length === 0 ? (
            <div className="ftn-muted">Aucune facture sur les 30 derniers jours.</div>
          ) : (
            <div className="grid gap-2">
              {recent.map((r) => (
                <div key={r.id} className="rounded-2xl border border-slate-200/60 bg-white/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-extrabold">{r.invoice_number || "Facture"}</div>
                      <div className="text-sm text-slate-600">Statut: {r.status || "—"}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="ftn-badge">{money(r.total_ttc)} TND</span>
                      <Link className="ftn-btn-lux ftn-btn-ghost" href={`/invoices/${r.id}`}>
                        <span className="ftn-btn-shine" aria-hidden="true" />
                        <span className="ftn-btn-text">Ouvrir</span>
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
  );
}
