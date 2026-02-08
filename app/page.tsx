import Link from "next/link";
import AuthShell from "@/app/components/AuthShell";
import DigigoRootRedirect from "../DigigoRootRedirect";

export const dynamic = "force-dynamic";

export default async function Page() {
  return (
    <>
      {/* REDIRECTION DIGIGO (OBLIGATOIRE) */}
      <DigigoRootRedirect />

      <AuthShell
        title="Bienvenue sur FactureTN"
        subtitle="CRM & facturation électronique (Tunisie) – prêt pour TTN"
      >
        <p className="ftn-muted">
          Authentification sécurisée · Multi-sociétés · Rôles comptables ·
          Facturation · Exports PDF / fichiers TTN · Préparation TTN
        </p>

        <div className="mt-6 grid gap-3">
          <Link href="/login" className="ftn-btn w-full text-center">
            Connexion
          </Link>

          <Link
            href="/register"
            className="ftn-btn-ghost w-full text-center"
          >
            Créer un compte
          </Link>
        </div>
      </AuthShell>
    </>
  );
}
