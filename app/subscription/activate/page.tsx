// app/subscription/activate/page.tsx
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

function shortRefFromId(id: string) {
  const s = String(id || "").replace(/[^a-zA-Z0-9]/g, "");
  return `ABO-${s.slice(0, 8).toUpperCase()}`;
}

/** ✅ Identité bancaire (renseignée) */
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

async function countActiveInternalCompaniesForGroup(opts: {
  supabase: any;
  groupId: string;
}) {
  // ✅ Dans votre schéma: group_companies n’a PAS is_active.
  // ✅ Le statut actif est dans companies.is_active.
  // Donc: compter les liens internes dont la société est active.

  const { count, error } = await opts.supabase
    .from("group_companies")
    .select("id, companies!inner(id)", { count: "exact", head: true })
    .eq("group_id", opts.groupId)
    .eq("link_type", "internal")
    .eq("companies.is_active", true);

  if (error) {
    // fallback safe: si jointure bloquée / RLS / autre
    const { count: c2 } = await opts.supabase
      .from("group_companies")
      .select("id", { count: "exact", head: true })
      .eq("group_id", opts.groupId)
      .eq("link_type", "internal");

    return Math.max(0, Number(c2 ?? 0));
  }

  return Math.max(0, Number(count ?? 0));
}

async function computePriceHt(opts: {
  supabase: any;
  scopeType: "company" | "group";
  scopeId: string;
}) {
  // ✅ Règles FactureTN
  // - Société: 50 DT / mois
  // - Groupe: 29 DT / mois * nb sociétés internes ACTIVES (companies.is_active = true)
  if (opts.scopeType === "company") return 50;

  const nbActives = await countActiveInternalCompaniesForGroup({
    supabase: opts.supabase,
    groupId: opts.scopeId,
  });

  return 29 * nbActives;
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

  // Resolve scope + back link + shell context
  let scopeType: "company" | "group" | null = null;
  let scopeId: string | null = null;
  let title = "Abonnement";
  let subtitle: string = "Paiement par virement bancaire";
  let backHref = "/subscription";

  let accountType:
    | "profil"
    | "entreprise"
    | "multi_societe"
    | "comptable"
    | undefined;

  let activeCompanyId: string | null = null;
  let activeGroupId: string | null = null;

  // ✅ IMPORTANT: string (jamais null)
  let scopeLabel: string = "Abonnement";

  if (companyId) {
    scopeType = "company";
    scopeId = companyId;
    backHref = `/companies/${encodeURIComponent(companyId)}/subscription`;
    accountType = "entreprise";
    activeCompanyId = companyId;

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

  // ✅ PRIX: Société=50, Groupe=29*nb sociétés internes actives
  const priceHt = await computePriceHt({ supabase, scopeType, scopeId });

  // Create or update a platform subscription (manual activation workflow)
  const { data: existingSub } = await supabase
    .from("platform_subscriptions")
    .select("id,status,price_ht,scope_type,scope_id")
    .eq("owner_user_id", auth.user.id)
    .eq("scope_type", scopeType)
    .eq("scope_id", scopeId)
    .limit(1);

  let upsertedSub =
    existingSub && existingSub.length > 0 ? existingSub[0] : null;

  const noteText =
    scopeType === "company"
      ? "Activation manuelle Société (virement)."
      : "Activation manuelle Groupe (29 DT / société interne active).";

  if (upsertedSub?.id) {
    const { data: updated, error: updErr } = await supabase
      .from("platform_subscriptions")
      .update({
        status: "paused", // paiement attendu (activation manuelle)
        price_ht: priceHt, // ✅ force le nouveau prix
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

  // Create (best-effort) a pending payment record if none pending exists
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
      amount_ht: priceHt, // ✅ montant correct
      method: "virement",
      status: "pending",
      reference,
      note: "Paiement en attente — à valider manuellement.",
    });
  }

  // Petit label prix lisible
  const priceLabel =
    scopeType === "company"
      ? "50 DT / mois (HT)"
      : `${Number(priceHt).toFixed(0)} DT / mois (HT) — 29 DT × sociétés internes actives`;

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
            <div className="font-semibold text-slate-900">
              Étape suivante : Virement bancaire
            </div>

            <p className="mt-2">
              Pour activer votre abonnement, veuillez effectuer un{" "}
              <b>virement bancaire</b> en indiquant la <b>référence</b> ci-dessous.
            </p>

            <div className="mt-5 grid gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Référence obligatoire</div>
                <div className="mt-1 text-lg font-bold tracking-wider text-slate-900">
                  {reference}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  (Sans référence, l’activation peut être retardée)
                </div>
              </div>

              <div className="rounded-xl bg-white border border-slate-200 p-4">
                <div className="text-xs text-slate-500">Coordonnées de paiement</div>

                <div className="mt-2 space-y-1 text-sm text-slate-800">
                  <div>
                    <b>Banque :</b> {BANK_INFO.bankName}{" "}
                    <span className="text-xs text-slate-500">
                      (SWIFT {BANK_INFO.swift})
                    </span>
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
                <div className="text-sm font-semibold text-slate-900">
                  Après paiement
                </div>
                <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
                  <li>
                    Votre abonnement sera activé après validation (manuelle) du paiement.
                  </li>
                  <li>
                    Si besoin, vous pouvez envoyer un justificatif au support pour accélérer.
                  </li>
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
          Astuce : si le client active un <b>virement permanent</b>, il doit garder{" "}
          <b>la même référence</b> chaque mois.
        </div>
      </div>
    </AppShell>
  );
}
