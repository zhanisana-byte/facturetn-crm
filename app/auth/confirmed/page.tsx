import Link from "next/link";

export default async function ConfirmedPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-12">
        <div className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_0_40px_rgba(16,185,129,0.12)] backdrop-blur">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Compte confirmé
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Votre compte est activé ✅</h1>
          <p className="mt-2 text-sm text-white/75">
            Vous pouvez maintenant accéder à votre espace Profil.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Aller au Profil
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
