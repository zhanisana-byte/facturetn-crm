"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/app/components/AuthShell";

export default function LoginClient() {
  const supabase = createClient();
  const router = useRouter();
  const params = useSearchParams();

  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState(params.get("email") || "");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      router.push(next);
    } catch (err: any) {
      setError(err?.message || "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Connexion" subtitle="Accédez à votre espace FactureTN.">
      <form onSubmit={onSubmit} className="grid gap-4">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="grid gap-2">
          <label className="ftn-label">Email</label>
          <input
            className="ftn-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ex: contact@domaine.com"
            autoComplete="email"
          />
        </div>

        <div className="grid gap-2">
          <label className="ftn-label">Mot de passe</label>
          <input
            className="ftn-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        <button className="ftn-btn w-full mt-1" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        <div className="text-sm text-slate-600 text-center">
          Pas de compte ?{" "}
          <Link className="ftn-link" href="/register">
            Créer un compte
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
