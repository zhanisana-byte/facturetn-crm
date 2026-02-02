
export const dynamic = "force-dynamic";

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";

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
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${cls}`}>
      {children}
    </span>
  );
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

  const { data: links } = await supabase
    .from("group_companies")
    .select("id, link_type, companies(is_active)")
    .eq("group_id", groupId);

  const internalActiveCount =
    (links ?? []).filter(
      (x: any) => x.link_type !== "external" && x.companies?.is_active === true
    ).length;

  const externalCount = (links ?? []).filter((x: any) => x.link_type === "external").length;

  const perCompanyHt = 29;
  const estimatedHt = internalActiveCount * perCompanyHt;

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
          <Pill tone="gold"> Par société</Pill>
        </div>

        <div className="mt-4 text-sm text-slate-700">
          Tarification : <b>Pack Groupe</b> + <b>29 DT HT</b> / <b>société interne active</b> / mois.
          <br />
          Les sociétés <b>externes invitées</b> ne sont <b>pas facturées</b>.
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-base font-semibold text-slate-900">Compteur (ce groupe)</div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Sociétés actives (internes)</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{internalActiveCount}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Sociétés externes (non facturées)</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{externalCount}</div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-500">Estimation variable (HT)</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{estimatedHt} DT</div>
            <div className="text-xs text-slate-500 mt-1">= {internalActiveCount} × 29 DT</div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <b>Vous êtes comptable / gestionnaire ?</b>
          <br />
          Vous pouvez faire payer chaque client (société) séparément, ou bien collaborer avec nous et{" "}
          <b>facturer vos honoraires</b> à vos clients pour la gestion de la facturation électronique.
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
            Gérer les sociétés du groupe
          </Link>
        </div>
      </div>
    </div>
  );
}
