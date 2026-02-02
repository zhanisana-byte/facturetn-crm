import AppShell from "@/app/components/AppShell";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Search = {
  plan?: string;
  company?: string;
  group?: string;
};

type PlatformSubStatus = "trial" | "active" | "paused" | "overdue" | "free" | "canceled";

function platformCovers(status: PlatformSubStatus | null | undefined) {
  return status === "active" || status === "free" || status === "trial";
}

function shortRefFromId(id: string) {
  const s = String(id || "").replace(/[^a-zA-Z0-9]/g, "");
  return `ABO-${s.slice(0, 8).toUpperCase()}`;
}

const BANK_INFO = {
  bankName: "Attijari bank",
  swift: "BSTUTNTT",
  agency: "LAC MARINA",
  rib_display: "70641450 71860392 71862477",
  account_number: "04060145004805694935",
  iban: "TN59 0406 0145 0048 0569 4935",
  currency: "TND",
  beneficiary_name: "ZHANI SANA DEALINK",
};

async function countActiveExternalCompaniesForGroup(opts: { supabase: any; groupId: string }) {
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
    .limit(1000);

  const rows = (data ?? []).filter((r: any) => String(r.link_type) === "external");
  return Math.max(0, rows.length);
}

async function computePriceHt(opts: { supabase: any; scopeType: "company" | "group"; scopeId: string }) {
  if (opts.scopeType === "company") return 50;

  const nbActives = await countActiveExternalCompaniesForGroup({
    supabase: opts.supabase,
    groupId: opts.scopeId,
  });

  return 29 * nbActives;
}

async function getCoveringGroupForCompany(opts: { supabase: any; companyId: string }) {
  const { data: links } = await opts.supabase
    .from("group_companies")
    .select("group_id, groups(id, group_name)")
    .eq("company_id", opts.companyId)
    .limit(20);

  const groups =
    (links ?? [])
      .map((l: any) => ({
        groupId: String(l.group_id || ""),
        groupName: String(l.groups?.group_name || "Groupe"),
      }))
      .filter((g: any) => !!g.groupId) ?? [];

  if (groups.length === 0) return null;

  for (const g of groups) {
    const { data: sub } = await opts.supabase
      .from("platform_subscriptions")
      .select("status")
      .eq("scope_type", "group")
      .eq("scope_id", g.groupId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const status = (sub?.status ? String(sub.status) : null) as PlatformSubStatus | null;
    if (platformCovers(status)) {
      return { ...g, status };
    }
  }

  return null;
}

export default async function SubscriptionActivatePage({
  searchParams,
}: {
  searchParams?: Promise<Search>;
}) {
  const sp = (await searchParams) ?? {};
  const companyId = sp.company || null;
  const groupId = sp.group || null;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  let scopeType: "company" | "group" | null = null;
  let scopeId: string | null = null;
  let title = "Abonnement";
  let subtitle: string = "Paiement par virement bancaire";
  let backHref = "/subscription";

  let accountType: "profil" | "entreprise" | "multi_societe" | "comptable" | undefined;

  let activeCompanyId: string | null = null;
  let activeGroupId: string | null = null;

  let scopeLabel: string = "Abonnement";

  if (companyId) {
    scopeType = "company";
    scopeId = companyId;
    backHref = `/companies/${encodeURIComponent(companyId)}/subscription`;
    accountType = "entreprise";
    activeCompanyId = companyId;

    const cover = await getCoveringGroupForCompany({ supabase, companyId });
    if (cover) {
      redirect(`${backHref}?covered=1`);
    }

    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .maybeSingle();

    scopeLabel = company?.company_name ?? "Société";
    title = "Abonnement Société";
    subtitle = scopeLabel;
  } else if (groupId) {
    scopeType = "group";
    scopeId = groupId;
    backHref = `/groups/${encodeURIComponent(groupId)}/subscription`;
    accountType = "multi_societe";
    activeGroupId = groupId;

    const { data: group } = await supabase
      .from("groups")
      .select("group_name")
      .eq("id", groupId)
      .maybeSingle();

    scopeLabel = (group as any)?.group_name ?? "Groupe";
    title = "Abonnement Groupe";
    subtitle = scopeLabel;
  }

  if (!scopeType || !scopeId) redirect("/subscription");

  const priceHt = await computePriceHt({ supabase, scopeType, scopeId });

  const { data: existingSub } = await supabase
    .from("platform_subscriptions")
    .select("id,status,price_ht,scope_type,scope_id")
    .eq("owner_user_id", auth.user.id)
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .limit(1);

  let upsertedSub = existingSub && existingSub.length > 0 ? existingSub[0] : null;

  const noteText =
    scopeType === "company"
      ? "Activation manuelle Société (virement)."
      : "Activation manuelle Groupe (29 DT / société externe active).";

  if (upsertedSub?.id) {
    const { data: updated, error: updErr } = await supabase
      .from("platform_subscriptions")
      .update({
        status: "paused",
        price_ht: priceHt,
        quantity: 1,
        note: noteText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", upsertedSub.id)
      .select("id,status,price_ht,scope_type,scope_id")
      .maybeSingle();

    if (!updErr && updated?.id) upsertedSub = updated as any;
  } else {
    const { data: created, error: insErr } = await supabase
      .from("platform_subscriptions")
      .insert({
        owner_user_id: auth.user.id,
        scope_type: scopeType,
        scope_id: scopeId,
        status: "paused",
        price_ht: priceHt,
        quantity: 1,
        note: noteText,
      })
      .select("id,status,price_ht,scope_type,scope_id")
      .maybeSingle();

    if (!insErr && created?.id) upsertedSub = created as any;
  }

  if (!upsertedSub?.id) redirect(backHref);

  const reference = shortRefFromId(upsertedSub.id);

  const { data: existingPending } = await supabase
    .from("platform_payments")
    .select("id")
    .eq("subscription_id", upsertedSub.id)
    .eq("status", "pending")
    .limit(1);

  if (!existingPending || existingPending.length === 0) {
    await supabase.from("platform_payments").insert({
      subscription_id: upsertedSub.id,
      payer_user_id: auth.user.id,
      amount_ht: priceHt,
      method: "virement",
      status: "pending",
      reference,
      note: "Paiement en attente — à valider manuellement.",
    });
  }

  const priceLabel =
    scopeType === "company"
      ? "50 DT / mois (HT)"
      : `${Number(priceHt).toFixed(0)} DT / mois (HT) — 29 DT × sociétés externes actives`;

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
      accountType={accountType}
      activeCompanyId={activeCompanyId}
      activeGroupId={activeGroupId}
    >
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Étape suivante : Virement bancaire</div>

            <p className="mt-2">
              Pour activer votre abonnement, veuillez effectuer un <b>virement bancaire</b> en indiquant la{" "}
              <b>référence</b> ci-dessous.
            </p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Référence obligatoire</div>
                <div className="mt-1 text-lg font-bold tracking-wider text-slate-900">{reference}</div>
                <div className="mt-2 text-xs text-slate-500">(Sans référence, l’activation peut être retardée)</div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Coordonnées de paiement</div>

                <div className="mt-2 space-y-1 text-sm text-slate-800">
                  <div>
                    <b>Banque :</b> {BANK_INFO.bankName}{" "}
                    <span className="text-xs text-slate-500">(SWIFT {BANK_INFO.swift})</span>
                  </div>
                  <div>
                    <b>Agence :</b> {BANK_INFO.agency}
                  </div>
                  <div>
                    <b>Bénéficiaire :</b> {BANK_INFO.beneficiary_name}
                  </div>
                  <div>
                    <b>IBAN :</b> {BANK_INFO.iban}
                  </div>
                  <div>
                    <b>RIB :</b> {BANK_INFO.rib_display}
                  </div>
                  <div>
                    <b>Compte :</b> {BANK_INFO.account_number}
                  </div>
                  <div>
                    <b>Devise :</b> {BANK_INFO.currency}
                  </div>

                  <div className="pt-2 text-xs text-slate-600">
                    Montant mensuel (HT) : <b>{priceLabel}</b>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Après paiement</div>
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
                  <li>Votre abonnement sera activé après validation (manuelle) du paiement.</li>
                  <li>Si besoin, vous pouvez envoyer un justificatif au support pour accélérer.</li>
                </ul>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href={backHref}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-2 text-sm text-white hover:bg-slate-800 transition"
              >
                Retour
              </Link>

              <Link
                href="/switch"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm text-slate-900 hover:bg-slate-50 transition"
              >
                Switch
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          Astuce : si le client active un virement permanent, il doit garder la même référence chaque mois.
        </div>
      </div>
    </AppShell>
  );
}
