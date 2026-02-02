import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import CreateCompanyClient from "./CreateCompanyClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CreateCompanyPage() {
  const supabase = await createClient();
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  return (
    <AppShell title="Créer une société" subtitle="Espace Profil" accountType="profil">
      <div className="mx-auto w-full max-w-xl p-6 space-y-14">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Créer une société</h2>
          <p className="text-sm text-gray-600">
            Pour une entreprise qui gère directement ses factures, ses clients et son abonnement.
          </p>
        </div>

        <CreateCompanyClient />

        <div className="border-t pt-10 space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Créer votre espace de travail</h2>
            <p className="text-sm text-gray-600">
              Choisissez le type d’espace selon votre activité.
            </p>
          </div>

          <div className="grid gap-4">
            <div className="rounded-xl border bg-white p-5 space-y-3">
              <div>
                <h3 className="text-base font-semibold">Créer un Groupe</h3>
                <p className="text-sm text-gray-600">
                  Pour une structure qui centralise plusieurs sociétés (multi-société).
                </p>
              </div>

              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Regrouper plusieurs sociétés sous un même espace</li>
                <li>Suivi global (sociétés, factures, accès)</li>
                <li>Chaque société reste indépendante et garde son abonnement</li>
              </ul>

              <div className="pt-2">
                <Link
                  href="/groups/create"
                  className="inline-flex items-center justify-center rounded-lg border border-black px-5 py-2.5 text-sm font-medium hover:bg-black hover:text-white transition"
                >
                  Créer un Groupe
                </Link>
              </div>
            </div>

            <div className="rounded-xl border bg-gray-50 p-5 space-y-3">
              <div>
                <h3 className="text-base font-semibold">Créer un Cabinet</h3>
                <p className="text-sm text-gray-600">
                  Pour les cabinets qui prennent en charge des clients et facturent des honoraires.
                </p>
              </div>

              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Gérer plusieurs clients (sociétés) avec une équipe</li>
                <li>Facturer pour le compte des clients + honoraires</li>
                <li>Chaque client paie son abonnement, comptes déjà prêts</li>
              </ul>

              <div className="pt-2">
                <Link
                  href="/cabinet/create"
                  className="inline-flex items-center justify-center rounded-lg border border-black px-5 py-2.5 text-sm font-medium hover:bg-black hover:text-white transition"
                >
                  Créer un Cabinet
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
