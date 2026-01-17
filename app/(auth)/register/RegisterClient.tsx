"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/app/components/AuthShell";

export default function RegisterClient() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();

  // ✅ Après inscription/login : dashboard Profil Pro
  const next = params.get("next") || "/dashboard";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const fn = fullName.trim();
    const em = email.trim().toLowerCase();

    if (!fn) return setError("Le nom complet est obligatoire.");
    if (!em) return setError("L'email est obligatoire.");
    if (!password) return setError("Le mot de passe est obligatoire.");
    if (password.length < 6)
      return setError("Le mot de passe doit contenir au moins 6 caractères.");
    if (password !== confirm)
      return setError("Les mots de passe ne correspondent pas.");
    if (!agree) return setError("Veuillez accepter les conditions.");

    setLoading(true);

    try {
      // ✅ Inscription UNIQUEMENT Profil Pro
      const account_type = "profil";

      const { data, error: signErr } = await supabase.auth.signUp({
        email: em,
        password,
        options: {
          data: {
            full_name: fn,
            account_type, // ✅ stocké dans metadata
          },
        },
      });

      if (signErr) {
        setError(signErr.message);
        return;
      }

      // ✅ IMPORTANT :
      // ta DB met souvent app_users.account_type = 'entreprise' (default)
      // donc si on a une session (email confirmation OFF), on force l’update ici.
      if (data?.session?.user) {
        const userId = data.session.user.id;

        const { error: upErr } = await supabase
          .from("app_users")
          .update({ account_type: "profil" })
          .eq("id", userId);

        // si ça échoue, on continue quand même (pas bloquant)
        if (upErr) console.warn("app_users update failed:", upErr.message);

        router.replace(next);
        return;
      }

      // ✅ Si email confirmation ON (pas de session),
      // on passe par /login et après login ça ira au next
      router.push(`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(em)}`);
    } catch (err: any) {
      setError(err?.message || "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Créer un compte"
      subtitle="Inscription en tant que Profil Pro (vous pourrez créer Entreprise/Cabinet/Groupe après)."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error ? <div className="ftn-alert tone-bad">{error}</div> : null}

        <div>
          <label className="ftn-label">Nom complet</label>
          <input
            className="ftn-input w-full"
            placeholder="Votre nom"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
          />
        </div>

        <div>
          <label className="ftn-label">Email</label>
          <input
            className="ftn-input w-full"
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            type="email"
          />
        </div>

        <div>
          <label className="ftn-label">Mot de passe</label>
          <input
            className="ftn-input w-full"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            type="password"
          />
        </div>

        <div>
          <label className="ftn-label">Confirmer le mot de passe</label>
          <input
            className="ftn-input w-full"
            placeholder="••••••••"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            type="password"
          />
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
          <span>J’accepte les conditions d’utilisation et la politique de confidentialité.</span>
        </label>

        <button className="ftn-btn w-full mt-2" disabled={loading} type="submit">
          {loading ? "Création..." : "Créer mon compte"}
        </button>

        <div className="text-sm text-slate-600 text-center">
          Déjà un compte ?{" "}
          <Link className="ftn-link" href="/login">
            Se connecter
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
