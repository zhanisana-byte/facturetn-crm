"use client";

import { useState, ChangeEvent, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterClient() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [country, setCountry] = useState<"TN" | "FR">("TN");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function getSiteUrl() {
    const env =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_VERCEL_URL ||
      "";

    const normalizedEnv = env
      ? env.startsWith("http")
        ? env
        : `https://${env}`
      : "";

    if (typeof window !== "undefined") return window.location.origin;
    return normalizedEnv || "https://facturetn.com";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      setErr(
        "Configuration Supabase manquante. Vérifiez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sur Vercel (Production + Preview), puis redéployez."
      );
      return;
    }

    const siteUrl = getSiteUrl();
    const emailRedirectTo = `${siteUrl}/auth/callback?next=/profile/settings`;

    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: fullName.trim(),
          account_type: "profil",
          country_code: country, 
        },
      },
    });

    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setOk(true);
    router.push("/auth/check-email");
  }

  if (ok) {
    return (
      <div>
        <div className="ftn-card-title">Compte créé avec succès </div>
        <p className="ftn-muted mt-2">
          Veuillez vérifier votre boîte email afin de confirmer votre inscription.
        </p>
        <Link className="ftn-btn w-full mt-5" href="/auth/check-email">
          Voir les instructions
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="ftn-label">Nom complet</label>
      <input
        className="ftn-input"
        value={fullName}
        onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
          setFullName(e.target.value)
        }
        placeholder="ex: Sana Zhani"
        autoComplete="name"
        required
      />

      <label className="ftn-label mt-4">Email</label>
      <input
        className="ftn-input"
        type="email"
        value={email}
        onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
          setEmail(e.target.value)
        }
        placeholder="ex: contact@entreprise.tn"
        autoComplete="email"
        required
      />

      <label className="ftn-label mt-4">Mot de passe</label>
      <input
        className="ftn-input"
        type="password"
        value={password}
        onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
          setPassword(e.target.value)
        }
        placeholder="••••••••"
        autoComplete="new-password"
        minLength={6}
        required
      />

      <label className="ftn-label mt-4">Pays</label>
      <select
        className="ftn-input"
        value={country}
        onChange={(e: ChangeEvent<HTMLSelectElement>) =>
          setCountry((e.target.value as "TN" | "FR") || "TN")
        }
      >
        <option value="TN">Tunisie</option>
        <option value="FR" disabled>
          France (bientôt)
        </option>
      </select>

      {err ? <div className="ftn-alert mt-4">{err}</div> : null}

      <button className="ftn-btn w-full mt-5" disabled={loading}>
        {loading ? "Création..." : "Créer mon compte"}
      </button>

      <div className="mt-4 text-xs text-slate-500 leading-relaxed">
        En créant un compte, vous acceptez nos{" "}
        <Link className="underline" href="/conditions-generales">
          Conditions générales
        </Link>{" "}
        et notre{" "}
        <Link className="underline" href="/mentions-legales">
          Mention légale
        </Link>
        .
      </div>

      <div className="mt-4">
        <Link className="ftn-link" href="/login">
          J’ai déjà un compte
        </Link>
      </div>
    </form>
  );
}
