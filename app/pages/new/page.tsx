import Link from "next/link";
import { Card } from "@/components/ui";

export default async function NewWorkspacePage() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="p-5">
        <h2 className="text-lg font-semibold">Société</h2>
        <p className="text-sm text-slate-600 mt-1">
          Créez une société (Nom + Matricule fiscal), puis complétez les infos.
        </p>
        <div className="mt-4">
          <Link
            href="/companies/create"
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white text-sm"
          >
            Créer une société
          </Link>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Groupe</h2>
        <p className="text-sm text-slate-600 mt-1">
          Créez un groupe (Nom du profil), puis complétez les infos.
        </p>
        <div className="mt-4">
          <Link
            href="/groups/create"
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white text-sm"
          >
            Créer un groupe
          </Link>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold">Cabinet</h2>
        <p className="text-sm text-slate-600 mt-1">
          Créez un cabinet (Nom du cabinet), puis complétez les infos.
        </p>
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
  );
}
