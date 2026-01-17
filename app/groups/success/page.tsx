import Link from "next/link";
import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function GroupSuccessPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const id = sp.id;

  if (!id) redirect("/pages/new");

  return (
    <AppShell accountType="profil" title="Création réussie ✅">
      <Card className="p-6 max-w-xl">
        <p className="text-sm text-slate-600">
          Votre groupe a été créé avec succès. Vous pouvez maintenant gérer les sociétés et l’équipe.
        </p>

        <div className="mt-6 flex gap-2 flex-wrap">
          <Link
            href={`/groups/${id}`}
            className="h-10 rounded-md bg-black px-4 text-white text-sm inline-flex items-center"
          >
            Aller vers ce groupe
          </Link>

          <Link
            href="/switch"
            className="h-10 rounded-md border px-4 text-sm inline-flex items-center"
          >
            Retour (Switch)
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}
