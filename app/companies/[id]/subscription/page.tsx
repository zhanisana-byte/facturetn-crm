
export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ReactNode } from "react";

type SubStatus = "trialing" | "active" | "inactive" | "past_due" | "canceled";

function addMonths(d: Date, months: number) {
  const x = new Date(d.getTime());
  const day = x.getDate();
  x.setMonth(x.getMonth() + months);
  if (x.getDate() !== day) x.setDate(0);
  return x;
}

function fmtDate(d: Date) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffCalendarDays(from: Date, to: Date) {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
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
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${cls}`}>
      {children}
    </span>
  );
}

export default async function CompanySubscriptionPage(props: { params?: Promise<{ id: string }> }) {
  const params = (await props.params) ?? ({} as any);
  const { id: companyId } = params as any;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id, company_name, tax_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) redirect("/switch");

  const { data: myMembership } = await supabase
    .from("memberships")
    .select("role,is_active")
    .eq("company_id", companyId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const isManager = Boolean(
    myMembership?.is_active && (myMembership.role === "owner" || myMembership.role === "admin")
  );

  const createdAt = auth.user.created_at ? new Date(auth.user.created_at) : new Date();
  const trialEndsAt = addMonths(createdAt, 1);
  const now = new Date();
  const trialActive = now < trialEndsAt;
  const daysLeft = diffCalendarDays(now, trialEndsAt);

  let subscriptionStatus: SubStatus = trialActive ? "trialing" : "inactive";
  try {
    const { data: sub } = await supabase
      .from("company_subscriptions")
      .select("status")
      .eq("company_id", companyId)
      .maybeSingle();

    if (sub?.status) subscriptionStatus = String(sub.status) as SubStatus;
  } catch {
    
  }

  const pricePerMonth = 50;

  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-900">Abonnement Société</div>
            <div className="mt-1 text-sm text-slate-600">
              Société : <b>{company.company_name ?? "Société"}</b>{" "}
              {company.tax_id ? <span className="text-slate-500">• MF {company.tax_id}</span> : null}
            </div>
          </div>

          {subscriptionStatus === "active" ? (
            <Pill tone="success"> Actif</Pill>
          ) : subscriptionStatus === "trialing" ? (
            <Pill tone="gold"> Essai</Pill>
          ) : subscriptionStatus === "past_due" ? (
            <Pill tone="warning"> Paiement en retard</Pill>
          ) : subscriptionStatus === "canceled" ? (
            <Pill tone="warning"> Annulé</Pill>
          ) : (
            <Pill>Inactif</Pill>
          )}
        </div>

        <div className="mt-4 text-sm text-slate-700">
          <div>
            <b>Offre démarrage :</b> <b>1 mois gratuit</b>, puis <b>{pricePerMonth} DT / mois</b>.
          </div>
          <div className="mt-1 text-slate-600">
            Paiement mensuel recommandé pour réduire le risque (accès coupé en cas d’impayé).
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-base font-semibold text-slate-900">Ce qui est inclus</div>
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-700 space-y-1">
          <li>Création de factures électroniques (TEIF) + suivi</li>
          <li>Historique et gestion des factures par statut</li>
          <li>Collaboration avec votre comptable sur le même compte (permissions)</li>
          <li>Module TTN (envoi) selon les permissions</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Essai gratuit</div>
            <div className="text-sm text-slate-700 mt-1">
              Début : <b>{fmtDate(createdAt)}</b> • Fin : <b>{fmtDate(trialEndsAt)}</b>
            </div>
            {trialActive ? (
              <div className="text-xs text-slate-600 mt-1">
                Il reste <b>{daysLeft}</b> jour{daysLeft > 1 ? "s" : ""}.
              </div>
            ) : (
              <div className="text-xs text-slate-600 mt-1">Essai terminé.</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {isManager ? (
              <Link
                href={`/subscription/activate?plan=company_monthly_50&company=${encodeURIComponent(
                  companyId
                )}`}
                className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold bg-black text-white hover:opacity-90"
              >
                Activer / Régler
              </Link>
            ) : (
              <div className="text-xs text-slate-600">Owner/Admin requis pour gérer l’abonnement.</div>
            )}

            <Link
              href={`/companies/${encodeURIComponent(companyId)}`}
              className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold border border-slate-200 bg-white text-slate-900 hover:bg-slate-100"
            >
              Retour dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
