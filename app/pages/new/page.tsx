import Link from "next/link";
import { Card } from "@/components/ui";

export default async function NewWorkspacePage() {
  return (
    <div className="space-y-10">
      {/* SECTION HAUT : SOCIÉTÉ */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Créer une société</h2>
        <p className="text-sm text-slate-600 mt-2 max-w-xl">
          Pour une entreprise qui gère directement sa facturation, ses clients,
          ses déclarations et son abonnement.
        </p>

        <div className="mt-5">
          <Link
            href="/companies/create"
            className="inline-flex items-center justify-center rounded-md bg-black px-5 py-2.5 text-white text-sm"
          >
            Créer une société
          </Link>
        </div>
      </Card>

      {/* SECTION BAS : ESPACE DE TRAVAIL */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Créer un espace de travail</h2>
          <p className="text-sm text-slate-600 mt-1">
            Choisissez le type d’espace selon votre activité.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* GROUPE */}
          <Card className="p-5">
            <h3 className="text-lg font-semibold">Groupe</h3>
            <p className="text-sm text-slate-600 mt-1">
              Pour centraliser plusieurs sociétés sous un même espace.
            </p>

            <ul className="list-disc list-inside text-sm text-slate-600 mt-3 space-y-1">
              <li>Gestion multi-société</li>
              <li>Vue centralisée (sociétés, accès)</li>
              <li>Chaque société garde son abonnement</li>
            </ul>

            <div className="mt-4">
              <Link
                href="/groups/create"
                className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white text-sm"
              >
                Créer un groupe
              </Link>
            </div>
          </Card>

          {/* CABINET */}
          <Card className="p-5 bg-slate-50">
            <h3 className="text-lg font-semibold">Cabinet</h3>
            <p className="text-sm text-slate-600 mt-1">
              Pour les cabinets qui prennent en charge des clients.
            </p>

            <ul className="list-disc list-inside text-sm text-slate-600 mt-3 space-y-1">
              <li>Gestion de plusieurs clients</li>
              <li>Facturation pour le compte des clients</li>
              <li>Honoraires + clients avec abonnement</li>
            </ul>

            <div className="mt-4">
              <Link
                href="/cabinet/create"
                className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white text-sm"
              >
                Créer un cabinet
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
