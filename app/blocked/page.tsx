import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type SP = { reason?: string; next?: string };

function label(reason?: string) {
  switch (reason) {
    case "cabinet_facturation":
      return {
        title: "Accès bloqué",
        text: "Le Cabinet ne facture pas dans ce modèle. La facturation se fait uniquement via votre Profil.",
      };
    case "societe_facturation":
      return {
        title: "Accès bloqué",
        text: "La Société ne facture pas directement. La facturation se fait uniquement via votre Profil.",
      };
    case "groupe_facturation":
      return {
        title: "Accès bloqué",
        text: "Le Groupe ne facture pas directement. La facturation se fait uniquement via votre Profil.",
      };
    case "deprecated":
      return {
        title: "Page indisponible",
        text: "Cette page n'est plus utilisée dans cette version du CRM.",
      };
    default:
      return {
        title: "Accès bloqué",
        text: "Cette page n'est pas disponible selon vos règles d'accès.",
      };
  }
}

export default async function BlockedPage({
  searchParams,
}: {
  searchParams?: Promise<SP>;
}) {
  const sp = (await searchParams) ?? {};

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { title, text } = label(sp.reason);
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/switch";

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-slate-600">{text}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={next}
            className="inline-flex items-center rounded-xl bg-black px-4 py-2 text-white"
          >
            Continuer
          </Link>
          <Link
            href="/switch"
            className="inline-flex items-center rounded-xl border px-4 py-2"
          >
            Ouvrir Switch
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-xl border px-4 py-2"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
