import AppShell from "@/app/components/AppShell";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  return (
    <AppShell
      title="Aide & Support"
      subtitle="Nous sommes disponibles pour vous accompagner"
      accountType="profil"
    >
      <div className="ftn-grid">
        <div className="ftn-card">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="text-sm text-slate-600 mt-2">
            Notre équipe est disponible pour vous aider.
          </p>

          <div className="mt-4 space-y-2 text-sm">
            <div>
              📧 Email :{" "}
              <a className="text-indigo-700 hover:underline" href="mailto:zhanisana@gmail.com">
                zhanisana@gmail.com
              </a>
            </div>
            <div>
              📞 Téléphone :{" "}
              <a className="text-indigo-700 hover:underline" href="tel:+21620121521">
                +216 20 121 521
              </a>
            </div>
          </div>

          <div className="mt-5 text-xs text-slate-500">
            (Bientôt : formulaire de support directement dans l’application)
          </div>
        </div>
      </div>
    </AppShell>
  );
}
