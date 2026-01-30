"use client";

import { useEffect, useMemo, useState, ChangeEvent, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type SessionResult = {
  data?: { session?: unknown | null };
  error?: unknown;
};

export default function LoginClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const nextUrl = useMemo(() => sp.get("next") || "/switch", [sp]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState<"TN" | "FR">("TN");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Si déjà connecté -> switch direct
  useEffect(() => {
    const supabase = createClient();

    (supabase.auth.getSession() as Promise<SessionResult>).then((res: SessionResult) => {
      if (res?.data?.session) {
        router.replace("/switch");
      }
    });
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    try {
      const supabase = createClient();

      const result = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (result?.error) {
        setErr(result.error.message);
        setLoading(false);
        return;
      }

      // On conserve le pays côté navigateur (utile plus tard si vous ajoutez FR)
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("ftn_country", country);
        }
      } catch {
        // ignore
      }

      router.replace(nextUrl);
      router.refresh();
    } catch {
      setErr("Erreur de connexion. Réessayez.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="ftn-card max-w-md w-full">
        <div className="ftn-card-head">
          <div className="text-xl font-bold">Connexion</div>
          <div className="ftn-muted mt-1">Accédez à votre espace</div>
        </div>

        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <select
            value={country}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              setCountry((e.target.value as "TN" | "FR") || "TN")
            }
            className="w-full rounded-xl border px-3 py-2 text-sm"
          >
            <option value="TN">Tunisie</option>
            <option value="FR" disabled>
              France (bientôt)
            </option>
          </select>

          <input
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
              setEmail(e.target.value)
            }
            placeholder="Email"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            autoComplete="email"
          />

          <input
            value={password}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
              setPassword(e.target.value)
            }
            placeholder="Mot de passe"
            type="password"
            className="w-full rounded-xl border px-3 py-2 text-sm"
            autoComplete="current-password"
          />

          {err ? <div className="ftn-alert">{err}</div> : null}

          <button className="ftn-btn" disabled={loading} type="submit">
            {loading ? "Connexion..." : "Se connecter"}
          </button>

          <div className="text-xs text-slate-500 leading-relaxed">
            En continuant, vous acceptez nos{" "}
            <Link className="underline" href="/conditions-generales">
              Conditions générales
            </Link>{" "}
            et notre{" "}
            <Link className="underline" href="/mentions-legales">
              Mention légale
            </Link>
            .
          </div>

          <div className="ftn-muted text-sm">
            Pas de compte ?{" "}
            <Link className="ftn-link" href="/register">
              Créer un compte
            </Link>
          </div>
        </form>
      </div>

      <div className="mt-6 text-center text-xs text-slate-500">
        Projet réalisé par <b>Sana</b>, experte en Web Marketing.
      </div>
    </div>
  );
}
