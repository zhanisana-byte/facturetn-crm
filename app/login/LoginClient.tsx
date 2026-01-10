"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/app/components/AuthShell";

export default function LoginClient() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = sp.get("next") || sp.get("redirect") || "/dashboard";
  const prefillEmail = sp.get("email") || "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    router.push(nextUrl);
    router.refresh();
  }

  const registerHref = `/register?next=${encodeURIComponent(nextUrl)}&email=${encodeURIComponent(
    email || prefillEmail
  )}`;

  const forgotHref = `/forgot-password?next=${encodeURIComponent(nextUrl)}&email=${encodeURIComponent(
    email || prefillEmail
  )}`;

  return (
    <AuthShell title="Connexion" subtitle="Accédez à votre espace FactureTN.">
      <form onSubmit={onSubmit}>
        <label className="ftn-label">Email</label>
        <input
          className="ftn-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="ex: contact@entreprise.tn"
          required
        />

        <label className="ftn-label mt-4">Mot de passe</label>
        <input
          className="ftn-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="••••••••"
          required
        />

        <div className="mt-4 flex items-center justify-between gap-3">
          <Link className="ftn-link" href={forgotHref}>
            Mot de passe oublié ?
          </Link>

          <Link
            className="text-sm font-medium text-slate-700 hover:underline underline-offset-4"
            href={registerHref}
          >
            Créer un compte
          </Link>
        </div>

        {err && <div className="ftn-alert mt-3">{err}</div>}

        <button className="ftn-btn w-full mt-5" disabled={loading}>
          {loading ? "Connexion..." : "Se connecter"}
        </button>

        {sp.get("next") ? (
          <div className="mt-3 text-xs text-slate-500">
            Après connexion, vous serez redirigé vers la page demandée.
          </div>
        ) : null}
      </form>
    </AuthShell>
  );
}
