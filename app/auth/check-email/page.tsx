import Link from "next/link";

export default async function CheckEmailPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-12">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_40px_rgba(203,108,230,0.12)] backdrop-blur">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Confirmation requise
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">
            Vérifiez votre boîte email
          </h1>
          <p className="mt-2 text-sm text-white/75">
            Nous venons de vous envoyer un lien de confirmation. Cliquez dessus pour activer votre compte,
            puis vous serez redirigé automatiquement vers votre espace Profil.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Aller à la connexion
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Retour au site
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">
            Astuce : si vous ne voyez rien, vérifiez les spams ou attendez 1–2 minutes. Vous pouvez relancer l’inscription si besoin.
          </div>
        </div>
      </div>
    </main>
  );
}
