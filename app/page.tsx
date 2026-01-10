import Link from "next/link";
import AuthShell from "@/app/components/AuthShell";

export default function Page() {
  return (
    <AuthShell
      title="Bienvenue sur FactureTN"
      subtitle="CRM & facturation électronique (Tunisie) — prêt pour TTN"
    >
      <p className="ftn-muted">
        Auth + Sociétés + memberships/roles + factures + exports PDF/XML (en cours).
      </p>
      <div className="mt-6 grid gap-3">
        <Link className="ftn-btn w-full text-center" href="/login">Connexion</Link>
        <Link className="ftn-btn-ghost w-full text-center" href="/register">Créer un compte</Link>
      </div>
    </AuthShell>
  );
}
