
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { ensureWorkspaceRow } from "@/lib/workspace/server";
import CompanySelectClient from "@/app/invoices/CompanySelectClient";
import GroupSelectClient from "@/app/groups/select/GroupSelectClient";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

type SubStatus = "trialing" | "active" | "inactive" | "past_due" | "canceled";

function addMonths(d: Date, months: number) {
  const x = new Date(d.getTime());
  const day = x.getDate();
  x.setMonth(x.getMonth() + months);

  if (x.getDate() !== day) {
    x.setDate(0);
  }
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
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border ${cls}`}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  subtitle,
  badge,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold text-slate-900">{title}</div>
            {subtitle ? (
              <div className="text-sm text-slate-600 mt-1">{subtitle}</div>
            ) : null}
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold
                 bg-slate-900 text-white hover:bg-slate-800 transition"
    >
      {children}
    </Link>
  );
}

function SecondaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold
                 border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 transition"
    >
      {children}
    </Link>
  );
}

export default async function SubscriptionPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase, auth.user.id);
  const activeMode = (ws?.active_mode ?? "profil") as string;

  const { data: me } = await supabase
    .from("app_users")
    .select("id,email,full_name,account_type")
    .eq("id", auth.user.id)
    .single();

  const accountType = (me?.account_type ?? activeMode ?? "profil") as string;

  const mode = (activeMode ?? "profil") as string;
  const activeCompanyId = (ws?.active_company_id as string | null) ?? null;
  const activeGroupId = (ws?.active_group_id as string | null) ?? null;

  if (mode === "entreprise" && !activeCompanyId) {
    const { data: mems } = await supabase
      .from("memberships")
      .select("company_id,role,can_create_invoices,is_active,companies(id,company_name)")
      .eq("user_id", auth.user.id)
      .eq("is_active", true);

    const companies = (mems ?? [])
      .map((m: any) => ({
        id: m.company_id,
        name: m.companies?.company_name ?? "Société",
        role: m.role ?? "member",
        canCreateInvoices: Boolean(m.can_create_invoices || m.role === "owner" || m.role === "admin"),
      }))
      .filter((c: any) => !!c.id);

    async function activateCompany(companyId: string) {
      "use server";
      const supabase = await createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) redirect("/login");
      await supabase.from("user_workspace").upsert(
        {
          user_id: auth.user.id,
          active_mode: "entreprise",
          active_company_id: companyId,
          active_group_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      redirect("/subscription");
    }

    return (
      <AppShell title="Abonnement" subtitle="Choisir une société" accountType={accountType as any}>
        <div className="mx-auto w-full max-w-6xl p-6">
          <CompanySelectClient
            companies={companies}
            activateCompany={activateCompany}
            message="Sélectionnez la société pour consulter l'abonnement (mode Société)."
          />
        </div>
      </AppShell>
    );
  }

  if (mode === "multi_societe" && !activeGroupId) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,groups(id,group_name)")
      .eq("user_id", auth.user.id)
      .eq("is_active", true);

    const groups = (gm ?? [])
      .map((m: any) => ({
        id: m.groups?.id,
        group_name: m.groups?.group_name ?? null,
        role: m.role ?? null,
      }))
      .filter((g: any) => !!g.id);

    async function activateGroup(groupId: string) {
      "use server";
      const supabase = await createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) redirect("/login");
      await supabase.from("user_workspace").upsert(
        {
          user_id: auth.user.id,
          active_mode: "multi_societe",
          active_company_id: null,
          active_group_id: groupId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      redirect("/subscription");
    }

    return (
      <AppShell title="Abonnement" subtitle="Choisir un groupe" accountType={accountType as any}>
        <div className="mx-auto w-full max-w-6xl p-6">
          <GroupSelectClient groups={groups} activate={activateGroup} />
        </div>
      </AppShell>
    );
  }

  const createdAt = auth.user.created_at ? new Date(auth.user.created_at) : new Date();
  const trialEndsAt = addMonths(createdAt, 2);
  const now = new Date();

  const trialActive = now < trialEndsAt;
  const daysLeft = diffCalendarDays(now, trialEndsAt);

  let subscriptionStatus: SubStatus = "inactive";
  let subscriptionPlan: string | null = null;

  try {

    const base = supabase.from("subscriptions").select("status,plan");

    let q = base as any;

    if ((activeMode === "entreprise" || activeMode === "comptable") && ws?.active_company_id) {
      q = q.eq("company_id", ws.active_company_id);
    } else if (activeMode === "multi_societe" && ws?.active_group_id) {
      q = q.eq("group_id", ws.active_group_id);
    } else {
      q = q.eq("user_id", auth.user.id);
    }

    const { data: sub } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (sub?.status) subscriptionStatus = sub.status;
    if (sub?.plan) subscriptionPlan = sub.plan;
  } catch {
    
  }

  const isActive = subscriptionStatus === "active";
  const isInactiveAfterTrial = !trialActive && !isActive;

  const statusPill = isActive ? (
    <Pill tone="success"> Abonnement actif</Pill>
  ) : trialActive ? (
    <Pill tone="gold">
       Essai en cours — {daysLeft} jour{daysLeft > 1 ? "s" : ""} restant{daysLeft > 1 ? "s" : ""}
    </Pill>
  ) : (
    <Pill tone="warning">⚠️ Abonnement non actif</Pill>
  );

  const statusMessage = isActive
    ? "Votre abonnement est actif. Vous pouvez gérer votre formule et vos paiements."
    : trialActive
      ? "Vous êtes en période gratuite (2 mois offerts). Activez votre abonnement à tout moment."
      : "Votre période gratuite est terminée. Activez l’abonnement pour continuer sans interruption.";

  const cta = isActive ? (
    <PrimaryButton href="/subscription/manage">Gérer mon abonnement</PrimaryButton>
  ) : trialActive ? (
    <SecondaryButton href="/subscription/activate">Activer maintenant</SecondaryButton>
  ) : (
    <PrimaryButton href="/subscription/activate">Activer mon abonnement</PrimaryButton>
  );

  const typeLabel =
    accountType === "entreprise"
      ? "Société"
      : accountType === "comptable"
        ? "Cabinet comptable"
        : accountType === "multi_societe"
          ? "Multi-Société (Groupe)"
          : "Profil";

  return (
    <AppShell title="Abonnement & Offres" accountType={accountType as any}>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        {}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-900">Abonnement & Offres</h1>
              <p className="text-slate-600 mt-2">
                Inscription gratuite + <b>2 mois offerts dès le 1er jour d’inscription</b>. Ensuite,
                activez l’abonnement adapté à votre type de compte.
              </p>
              <div className="mt-3">
                <Pill tone="gold"> Offre démarrage — 2 mois gratuits</Pill>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <SecondaryButton href="/switch">Switch</SecondaryButton>
              <SecondaryButton href="/help">Aide</SecondaryButton>
            </div>
          </div>
        </div>

        {}
        <div className="mt-6">
          <Card title="Votre statut" subtitle="Période gratuite et statut d’activation" badge={statusPill}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Type de compte</div>
                <div className="text-sm font-semibold text-slate-900 mt-1">{typeLabel}</div>
                {subscriptionPlan ? (
                  <div className="text-xs text-slate-600 mt-2">Plan : {subscriptionPlan}</div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Période gratuite</div>
                <div className="text-sm text-slate-900 mt-1">
                  Du <b>{fmtDate(createdAt)}</b> au <b>{fmtDate(trialEndsAt)}</b>
                </div>
                <div className="text-xs text-slate-600 mt-2">
                  Offre : <b>2 mois gratuits</b>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Action</div>
                <div className="text-sm text-slate-900 mt-1">{statusMessage}</div>
                <div className="mt-3">{cta}</div>
              </div>
            </div>

            {}
            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs text-slate-500">Paiement</div>
              <div className="text-sm text-slate-900 mt-1">
                <div className="font-semibold">Sana Zhani — Experte Digital & Développement</div>
                <div className="text-slate-600 mt-1">Attijari bank — Agence Lac Marina</div>
                <div className="text-slate-700 mt-1">
                  IBAN : <span className="font-mono">TN59 0406 0145 0048 0569 4935</span>
                </div>
              </div>
            </div>

            {isInactiveAfterTrial ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm">
                 Votre essai est terminé. Activez l’abonnement pour continuer à accéder aux fonctionnalités.
              </div>
            ) : null}

            {}
            {process.env.NODE_ENV !== "production" ? (
              <div className="mt-3 text-xs text-slate-500">
                Note : la partie paiement sera branchée ensuite (Stripe / paiement local). Pour
                l’instant, c’est une page UI + statut.
              </div>
            ) : null}
          </Card>
        </div>

        {}
        <div className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Choisir votre formule</h2>
            <div className="text-xs text-slate-500">Aucun paiement requis aujourd’hui</div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {}
            <Card
              title="Société"
              subtitle="Pour facturer, gérer vos clients, et paramétrer TTN."
              badge={<Pill tone="gold"> 2 mois gratuits</Pill>}
            >
              <div className="text-2xl font-bold text-slate-900">
                50 DT <span className="text-sm font-medium text-slate-500">/ mois</span>
              </div>

              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li>• Factures & factures permanentes</li>
                <li>• Clients / produits / paiements</li>
                <li>• Paramètres TTN</li>
                <li>• Invitations & permissions (membres)</li>
              </ul>

              <div className="mt-5 flex gap-2">
                <PrimaryButton href="/subscription/activate?plan=societe_50">
                  Activer — 50 DT / mois
                </PrimaryButton>
              </div>
            </Card>

            {}
            <Card
              title="Cabinet comptable"
              subtitle="Votre cabinet est gratuit : ce sont vos clients (sociétés) qui paient leur abonnement."
              badge={<Pill tone="success"> Gratuit</Pill>}
            >
              <div className="text-2xl font-bold text-slate-900">Gratuit</div>

              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li>• Gestion du cabinet 100% gratuite</li>
                <li>• Gestion des clients via invitations</li>
                <li>• Administration des comptes clients (selon permissions)</li>
                <li>• Les clients activent leur abonnement Société (50 DT / mois)</li>
              </ul>

              <div className="mt-5 flex gap-2">
                <PrimaryButton href="/accountant/cabinet">Continuer gratuitement</PrimaryButton>
                <SecondaryButton href="/invitations">Inviter un client</SecondaryButton>
              </div>
            </Card>

            {}
            <Card
              title="Multi-Société (Groupe)"
              subtitle="Gérez plusieurs sociétés + facturez librement vos honoraires."
              badge={<Pill tone="gold"> 2 mois gratuits</Pill>}
            >
              <div className="text-2xl font-bold text-slate-900">
                50 DT <span className="text-sm font-medium text-slate-500">/ société / mois</span>
              </div>

              <div className="mt-4 text-sm text-slate-700">
                Nous vous donnons les outils pour gérer la facturation TTN. La plateforme est à{" "}
                <b>50 DT / mois par société</b>, et vous êtes libres de{" "}
                <b>facturer vos honoraires à vos clients</b> selon vos services.
              </div>

              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                <li>• Gestion multi-sociétés</li>
                <li>• Accès par invitations & permissions</li>
                <li>• Suivi centralisé des sociétés</li>
              </ul>

              <div className="mt-5 flex gap-2">
                <PrimaryButton href="/subscription/activate?plan=group_50_per_company">
                  Choisir Groupe
                </PrimaryButton>
                <SecondaryButton href="/groups/companies">Voir mes sociétés</SecondaryButton>
              </div>
            </Card>
          </div>

          {}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Inscription gratuite</div>
            <div className="mt-1">
              Aucun paiement requis aujourd’hui. L’offre <b>“2 mois gratuits”</b> démarre
              automatiquement dès votre inscription.
            </div>
          </div>
        </div>

        {}
        {process.env.NODE_ENV !== "production" ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-sm font-semibold text-slate-900">Badges (affichage)</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="gold"> Offre démarrage — 2 mois gratuits</Pill>
              <Pill tone="gold"> Essai en cours — X jours restants</Pill>
              <Pill tone="warning"> Essai terminé</Pill>
              <Pill tone="success"> Abonnement actif</Pill>
              <Pill tone="warning">⚠️ Abonnement non actif</Pill>
              <Pill>50 DT / mois</Pill>
              <Pill tone="success">Gratuit</Pill>
              <Pill>50 DT / société / mois</Pill>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
