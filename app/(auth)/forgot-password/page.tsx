"use client";

import { useState, ChangeEvent, FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/app/components/AuthShell";

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/callback?next=/reset-password`,
    });

    setLoading(false);
    if (error) return setErr(error.message);
    setSent(true);
  }

  return (
    <AuthShell title="Mot de passe oublié" subtitle="On t’envoie un lien sécurisé pour réinitialiser.">
      {sent ? (
        <div>
          <div className="ftn-card-title">Email envoyé ✅</div>
          <p className="ftn-muted mt-2">
            Vérifiez votre boîte mail et cliquez sur le lien pour définir un nouveau mot de passe.
          </p>
          <Link className="ftn-btn w-full mt-5" href="/login">
            Retour à la connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <label className="ftn-label">Email</label>
          <input
            className="ftn-input"
            type="email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEmail(e.target.value)}
            placeholder="ex: contact@entreprise.tn"
            required
          />

          {err && <div className="ftn-alert">{err}</div>}

          <button className="ftn-btn w-full mt-5" disabled={loading}>
            {loading ? "Envoi..." : "Envoyer le lien"}
          </button>

          <div className="mt-4">
            <Link className="ftn-link" href="/login">Retour</Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
