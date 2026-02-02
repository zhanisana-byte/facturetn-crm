export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";

type PlatformSubStatus = "trial" | "active" | "paused" | "overdue" | "free" | "canceled";

function platformCovers(status: PlatformSubStatus | null | undefined) {
  return status === "active" || status === "free" || status === "trial";
}

function labelForStatus(status: PlatformSubStatus | null | undefined) {
  if (!status) return "—";
  if (status === "active") return "actif";
  if (status === "free") return "free";
  if (status === "trial") return "trial";
  if (status === "paused") return "paused";
  if (status === "overdue") return "overdue";
  if (status === "canceled") return "canceled";
  return String(status);
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "gold";
}) {
  const cls =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : tone === "gold"
          ? "border-yellow-300 bg-yellow-50 text-yellow-900"
          : "border-slate-200 bg-white text-slate-700";

  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${cls}`}>{children}</span>
  );
}

async function countActiveCompaniesForGroup(opts: { supabase: any; groupId: string }) {
  const { count, error } = await opts.supabase
    .from("group_companies")
    .select("id, companies!inner(id)", { count: "exact", head: true })
    .eq("group_id", opts.groupId)
    .eq("link_type", "external")
    .eq("companies.is_active", true);

  if (!error) return Math.max(0, Number(count ?? 0));

  const { data } = await opts.supabase
    .from("group_companies")
    .select("id, link_type")
    .eq("group_id", opts.groupId)
    .limit(500);

  const rows = (data ?? []).filter((r: any) => String(r.link_type) === "external");
  return Math.max(0, rows.length);
}

export default async function GroupSubscriptionPage(props: { params?: Promise<{ id: string }> }) {
  const params = (await props.params) ?? ({} as any);
  const { id: groupId } = params as any;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from("groups")
    .select("id, group_name")
    .eq("id", groupId)
    .maybeSingle();

  const { data: sub } = await supabase
    .from("platform_subscriptions")
    .select("status, price_ht")
    .eq("scope_type", "group")
    .eq("scope_id", groupId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = (sub?.status ? String(sub.status) : null) as PlatformSubStatus | null;

  const activeCount = await countActiveCompaniesForGroup({ supabase, groupId });
  const perCompanyHt = 29;
  const estimatedHt = activeCount * perCompanyHt;

  const badge = platformCovers(status) ? (
    <Pill tone="success">{`Statut: ${labelForStatus(status)}`}</Pill>
  ) : status ? (
    <Pill tone="warning">{`Statut: ${labelForStatus(status)}`}</Pill>
  ) : (
    <Pill>Non activé</Pill>
  );

  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">Abonnement Groupe</div>
            <div className="mt-1 text-sm text-slate-600">
              Groupe : <b>{group?.group_name ?? "Groupe"}</b>
            </div>
          </div>
          {badge}
        </div>

        <div className="mt-4 text-sm text-slate-700">
          Tarification : <b>29 DT HT</b> / <b>société acceptée</b> / mois.
          <br />
          Les sociétés comptées ici sont des <b>sociétés externes</b> liées au groupe (invitation acceptée) et actives.
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-base font-semibold text-slate-900">Compteur</div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Sociétés actives liées</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{activeCount}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Estimation variable (HT)</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{estimatedHt} DT</div>
            <div className="text-xs text-slate-500 mt-1">= {activeCount} × 29 DT</div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Une société externe est comptabilisée après : invitation acceptée → lien créé dans le groupe → société active.
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/subscription/activate?plan=group_29_per_company&group=${encodeURIComponent(groupId)}`}
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-black text-white hover:opacity-90"
          >
            Activer le groupe
          </Link>

          <Link
            href={`/groups/${encodeURIComponent(groupId)}/companies`}
            className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
          >
            Voir les sociétés liées
          </Link>
        </div>
      </div>
    </div>
  );
}
