import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCabinetContext, requireCabinet } from "@/lib/accountant/cabinet-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  const diff = Math.ceil((b - a) / (1000 * 60 * 60 * 24));
  return diff;
}

function Pill({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "danger"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-slate-200 bg-white text-slate-700";

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs ${cls}`}>{children}</span>;
}

function statusTone(status: string) {
  const s = String(status || "").toLowerCase();
  if (s.includes("accept") || s.includes("valid") || s === "verified") return "success" as const;
  if (s.includes("reject") || s.includes("refus")) return "danger" as const;
  if (s.includes("pend") || s.includes("trial")) return "warning" as const;
  return "neutral" as const;
}

export default async function AccountantDashboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  const { data: me } = await supabase
    .from("app_users")
    .select("id, full_name, email, accountant_status, accountant_verified_at, accountant_free_access")
    .eq("id", userId)
    .maybeSingle();

  const ctx = await resolveCabinetContext(supabase, userId);
  requireCabinet(ctx);

  const { data: cabinet } = await supabase
    .from("groups")
    .select("id, group_name, subscription_status, trial_ends_at, subscription_ends_at")
    .eq("id", ctx.cabinetGroupId)
    .maybeSingle();

  const { data: links } = await supabase
    .from("group_companies")
    .select("company_id, link_type, created_at, companies(id,company_name,tax_id)")
    .eq("group_id", ctx.cabinetGroupId)
    .order("created_at", { ascending: false });

  const companyIds = (links ?? []).map((x: any) => String(x?.company_id)).slice(0, 500);

  const nowIso = new Date().toISOString();
  const subMap = new Map<string, { endsAt: string | null; daysLeft: number | null }>();

  if (companyIds.length > 0) {
    const { data: subs } = await supabase
      .from("company_subscriptions")
      .select("company_id, ends_at")
      .in("company_id", companyIds);

    (subs ?? []).forEach((s: any) => {
      const endsAt = s?.ends_at ? String(s.ends_at) : null;
      subMap.set(String(s.company_id), {
        endsAt,
        daysLeft: endsAt ? daysBetween(nowIso, endsAt) : null,
      });
    });
  }

  const rows =
    (links ?? []).map((x: any) => {
      const c = x?.companies ?? null;
      const id = String(c?.id ?? x?.company_id);
      const sub = subMap.get(id) ?? { endsAt: null, daysLeft: null };
      return {
        id,
        name: String(c?.company_name ?? "Société"),
        taxId: String(c?.tax_id ?? "—"),
        linkType: x?.link_type === "external" ? "external" : "internal",
        daysLeft: sub.daysLeft,
      };
    }) ?? [];

  const expiring = rows.filter((r) => typeof r.daysLeft === "number" && (r.daysLeft as number) <= 14);

  const aStatus = String(me?.accountant_status ?? "non_validé");
  const badgeLabel =
    aStatus.toLowerCase().includes("accept") || aStatus.toLowerCase().includes("valid")
      ? "Cabinet validé"
      : aStatus.toLowerCase().includes("reject")
        ? "Cabinet refusé"
        : "Cabinet en attente";

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      {}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-900">
              {cabinet?.group_name ? `Cabinet : ${cabinet.group_name}` : "Dashboard Cabinet"}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              Gérez vos sociétés liées, vos invitations, et votre équipe.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Pill tone={statusTone(aStatus)}>{badgeLabel}</Pill>
            {me?.accountant_free_access ? <Pill tone="success">Accès gratuit actif</Pill> : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/accountant/cabinet" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
            Mon cabinet
          </Link>
          <Link href="/accountant/company-invitations" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
            Invitations sociétés
          </Link>
          <Link href="/accountant/invitations" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
            Invitations équipe
          </Link>
          <Link href="/accountant/team" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
            Équipe & permissions
          </Link>
          <Link href="/accountant/subscription" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm">
            Abonnement
          </Link>
        </div>
      </div>

      {}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2">
          <div className="text-sm font-semibold text-slate-900">Sociétés liées</div>
          <div className="mt-1 text-sm text-slate-600">
            {rows.length === 0 ? "Aucune société liée pour le moment." : `${rows.length} société(s) liée(s).`}
          </div>

          {rows.length === 0 ? (
            <div className="mt-4 text-sm text-slate-600">
              Commencez par inviter une société ou accepter une invitation.
            </div>
          ) : (
            <div className="mt-4 grid gap-2">
              {rows.slice(0, 8).map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-600">{r.taxId}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof r.daysLeft === "number" ? (
                      r.daysLeft <= 0 ? (
                        <Pill tone="danger">Expiré</Pill>
                      ) : r.daysLeft <= 14 ? (
                        <Pill tone="warning">{`Expire dans ${r.daysLeft} j`}</Pill>
                      ) : (
                        <Pill>{`J-${r.daysLeft}`}</Pill>
                      )
                    ) : (
                      <Pill>—</Pill>
                    )}
                    <Link
                      href={`/companies/${r.id}`}
                      className="text-sm text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-500"
                    >
                      Voir
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-sm font-semibold text-slate-900">Alertes</div>

          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <span>Abonnements bientôt expirés (≤ 14j)</span>
              <span className="font-semibold text-slate-900">{expiring.length}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span>Sociétés liées</span>
              <span className="font-semibold text-slate-900">{rows.length}</span>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              Pour bénéficier d’une <b>société gratuite</b>, votre cabinet doit être validé.
              Rendez-vous dans <b>Abonnement</b>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
