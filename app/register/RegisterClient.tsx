"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AccountType = "client" | "cabinet" | "groupe";

const OPTIONS: Array<{
  key: AccountType;
  title: string;
  subtitle: string;
  bullets: string[];
  accent: "orange" | "blue" | "violet";
}> = [
  {
    key: "client",
    title: "Une seule société",
    subtitle: "Auto-entrepreneur, freelance, petite société",
    bullets: ["Factures TTN", "1 société", "Démarrage rapide"],
    accent: "orange",
  },
  {
    key: "cabinet",
    title: "Cabinet comptable",
    subtitle: "Cabinet comptable ou équipe interne",
    bullets: ["Factures TTN", "Accès contrôlés", "Gestion clients"],
    accent: "blue",
  },
  {
    key: "groupe",
    title: "Multi-sociétés",
    subtitle: "Groupe, holding, multi-patentes",
    bullets: ["Factures TTN", "Centralisation", "Vue globale"],
    accent: "violet",
  },
];

export default function RegisterClient() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const plan = sp.get("plan") || "";
  const redirectTo = sp.get("redirect") || sp.get("next") || "/dashboard";
  const prefillEmail = sp.get("email") || "";

  const [accountType, setAccountType] = useState<AccountType>("client");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => {
    const cleanEmail = email.trim().toLowerCase();
    return (
      fullName.trim().length > 1 &&
      cleanEmail.length > 3 &&
      password.length >= 8 &&
      !loading
    );
  }, [email, fullName, password, loading]);

  async function handleRegister() {
    setErr(null);
    setOk(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setErr("Email obligatoire.");
    if (!password || password.length < 8)
      return setErr("Mot de passe: minimum 8 caractères.");
    if (!fullName.trim()) return setErr("Nom complet obligatoire.");

    setLoading(true);

    // 1) signup auth
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: fullName.trim(), plan: plan || null },
      },
    });

    if (error) {
      setLoading(false);
      setErr(error.message);
      return;
    }

    const userId = data?.user?.id;
    if (!userId) {
      setLoading(false);
      setErr("Compte créé, mais userId introuvable.");
      return;
    }

    // 2) upsert minimal profile (UNIQUEMENT colonnes sûres)
    // IMPORTANT: onConflict=id => pas de duplicate key
    const profilePayload = {
      id: userId,
      email: cleanEmail,
      full_name: fullName.trim(),
      account_type: accountType,
    };

    const { error: upErr } = await supabase
      .from("app_users")
      .upsert(profilePayload, { onConflict: "id" });

    if (upErr) {
      setLoading(false);
      setErr("Compte créé, mais profil non enregistré: " + upErr.message);
      return;
    }

    setLoading(false);

    // 3) Redirection
    // Si confirmation email activée: l'user peut ne pas être connecté -> middleware peut renvoyer /login
    setOk("Compte créé ✅ Redirection...");
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="ftn-shell">
      <div className="ftn-auth">
        <div className="ftn-auth-card ftn-reg-card">
          <h1 className="ftn-auth-title">Créer un compte</h1>
          <p className="ftn-auth-sub">
            Choisissez votre profil, puis créez votre accès.
          </p>

          {err && <div className="ftn-alert">{err}</div>}
          {ok && (
            <div className="ftn-alert" style={{ borderColor: "#22c55e" }}>
              {ok}
            </div>
          )}

          <div className="ftn-reg-grid">
            {OPTIONS.map((o) => {
              const active = accountType === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setAccountType(o.key)}
                  className={`ftn-reg-option accent-${o.accent} ${
                    active ? "is-active" : ""
                  }`}
                >
                  <div className="ftn-reg-top">
                    <span className="ftn-reg-dot" aria-hidden="true" />
                    <div className="ftn-reg-head">
                      <div className="ftn-reg-title">{o.title}</div>
                      <div className="ftn-reg-sub">{o.subtitle}</div>
                    </div>

                    <span className={`ftn-reg-check ${active ? "on" : ""}`}>
                      {active ? "✓" : "○"}
                    </span>
                  </div>

                  <div className="ftn-reg-bullets">
                    {o.bullets.map((b) => (
                      <span key={b} className="ftn-reg-pill">
                        {b}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="ftn-reg-form">
            <label className="ftn-label">Nom complet</label>
            <input
              className="ftn-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Sana Zhani"
              autoComplete="name"
            />

            <label className="ftn-label">Email</label>
            <input
              className="ftn-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemple.com"
              autoComplete="email"
              inputMode="email"
            />

            <label className="ftn-label">Mot de passe</label>
            <input
              type="password"
              className="ftn-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••••• (min 8)"
              autoComplete="new-password"
            />

            <button
              type="button"
              onClick={handleRegister}
              disabled={!canSubmit}
              className="ftn-btn"
              style={{ width: "100%", marginTop: 14 }}
            >
              {loading ? "Création..." : "Créer un compte"}
            </button>

            {plan ? (
              <div className="ftn-muted" style={{ marginTop: 10 }}>
                Plan détecté : <b>{plan}</b>
              </div>
            ) : null}

            <div className="ftn-muted" style={{ marginTop: 12 }}>
              Déjà un compte ?{" "}
              <a className="ftn-link" href="/login">
                Se connecter
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
