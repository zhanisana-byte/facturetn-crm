// app/register/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AccountType = "societe" | "cabinet" | "multi_societe" | "profil_compta";

const OPTIONS: Array<{
  key: AccountType;
  title: string;
  subtitle: string;
  bullets: string[];
  accent: "orange" | "blue" | "violet" | "slate";
}> = [
  {
    key: "societe",
    title: "Société — Facture TTN",
    subtitle: "Entreprise / freelance (1 société au départ)",
    bullets: ["Factures TTN conformes", "Gestion simple", "Inviter équipe ou comptable"],
    accent: "orange",
  },
  {
    key: "cabinet",
    title: "Cabinet comptable — Facture TTN",
    subtitle: "Cabinet (Comptable) — Gratuit après validation",
    bullets: ["Accès cabinet (gratuit)", "Gérer les factures TTN des clients", "Inviter équipe & collaborateurs"],
    accent: "blue",
  },
  {
    key: "multi_societe",
    title: "Multi-société — Facture TTN",
    subtitle: "Groupe / holding / multi-entités (forfait)",
    bullets: ["Multi-sociétés illimitées", "Équipe interne & rôles avancés", "Reporting & contrôle d’accès"],
    accent: "violet",
  },
  {
    key: "profil_compta",
    title: "Profil Compta — Collaborateur",
    subtitle: "Profil collaborateur (interne/externe) — via invitations",
    bullets: ["Accès via invitations", "Gérer les tâches & factures selon permissions", "Peut inviter un comptable (si autorisé)"],
    accent: "slate",
  },
];

export default function RegisterPage() {
  const supabase = createClient();
  const router = useRouter();
  const sp = useSearchParams();

  const plan = sp.get("plan") || "";
  const redirectTo = sp.get("redirect") || sp.get("next") || "/dashboard";
  const prefillEmail = sp.get("email") || "";

  const [accountType, setAccountType] = useState<AccountType>("societe");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");

  // Société
  const [companyName, setCompanyName] = useState("");
  const [companyTaxId, setCompanyTaxId] = useState("");

  // Cabinet (validation)
  const [accountantMf, setAccountantMf] = useState("");
  const [accountantPatente, setAccountantPatente] = useState("");

  // ✅ Mentions légales + CG
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit = useMemo(() => {
    const cleanEmail = email.trim().toLowerCase();

    const baseOk =
      fullName.trim().length > 1 &&
      cleanEmail.length > 3 &&
      password.length >= 8 &&
      acceptTerms &&
      !loading;

    if (!baseOk) return false;

    if (accountType === "societe") return companyName.trim().length > 1;

    if (accountType === "cabinet") {
      return accountantMf.trim().length > 3 && accountantPatente.trim().length > 2;
    }

    // multi_societe & profil_compta: pas de champs obligatoires en plus
    return true;
  }, [
    email,
    fullName,
    password,
    acceptTerms,
    loading,
    accountType,
    companyName,
    accountantMf,
    accountantPatente,
  ]);

  async function handleRegister() {
    setErr(null);

    if (!acceptTerms) {
      return setErr("Vous devez accepter les Mentions légales et les Conditions générales.");
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setErr("Email obligatoire.");
    if (!password || password.length < 8) return setErr("Mot de passe : minimum 8 caractères.");
    if (!fullName.trim()) return setErr("Nom complet obligatoire.");

    if (accountType === "societe" && !companyName.trim()) {
      return setErr("Nom de société obligatoire.");
    }

    if (accountType === "cabinet") {
      if (!accountantMf.trim()) return setErr("Matricule fiscal obligatoire.");
      if (!accountantPatente.trim()) return setErr("Patente obligatoire.");
    }

    setLoading(true);

    // 1) Auth signup
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          plan: plan || null,
          accept_terms: true,
          accept_terms_at: new Date().toISOString(),
          account_type: accountType, // utile
        },
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

    // 2) Upsert app_users
    const userPayload: any = {
      id: userId,
      email: cleanEmail,
      full_name: fullName.trim(),
      account_type: accountType,
      role: "user",
      is_active: true,

      // Plan interne (tu ajustes après)
      plan_code:
        accountType === "multi_societe"
          ? "multi_societe_start"
          : accountType === "cabinet"
            ? "cabinet_pending"
            : accountType === "profil_compta"
              ? "profil_compta"
              : "societe_start",

      max_companies: accountType === "multi_societe" ? 999 : accountType === "societe" ? 1 : 0,
      subscription_status: "active",

      accepted_terms: true,
      accepted_terms_at: new Date().toISOString(),
    };

    if (accountType === "cabinet") {
      userPayload.accountant_mf = accountantMf.trim();
      userPayload.accountant_patente = accountantPatente.trim();
      userPayload.accountant_status = "pending";
      userPayload.accountant_free_access = false; // activé après validation admin
    }

    const { error: upErr } = await supabase
      .from("app_users")
      .upsert(userPayload, { onConflict: "id" });

    if (upErr) {
      setLoading(false);
      setErr("Profil non enregistré : " + upErr.message);
      return;
    }

    // 3) Setup selon type
    // ✅ SOCIÉTÉ: créer société + membership owner
    if (accountType === "societe") {
      const { data: comp, error: cErr } = await supabase
        .from("companies")
        .insert({
          company_name: companyName.trim(),
          tax_id: companyTaxId.trim() || null,
          owner_user: userId,
          origin: "direct",
        })
        .select("id")
        .single();

      if (cErr || !comp?.id) {
        setLoading(false);
        setErr("Compte créé, mais société non créée : " + (cErr?.message || "Unknown"));
        return;
      }

      const { error: mErr } = await supabase.from("memberships").insert({
        company_id: comp.id,
        user_id: userId,
        role: "owner",
        can_manage_customers: true,
        can_create_invoices: true,
        can_validate_invoices: true,
        can_submit_ttn: true,
        is_active: true,
      });

      if (mErr) {
        setLoading(false);
        setErr("Société créée, mais accès non créé : " + mErr.message);
        return;
      }
    }

    // ✅ CABINET: pas de société tant que pending
    // ✅ MULTI: setup sociétés plus tard
    // ✅ PROFIL_COMPTA: accès uniquement via invitations

    setLoading(false);
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="ftn-shell">
      <div className="ftn-auth">
        <div className="ftn-auth-card ftn-reg-card">
          <h1 className="ftn-auth-title">Créer un compte</h1>
          <p className="ftn-auth-sub">
            Choisissez votre type d’accès FactureTN, puis complétez les informations.
          </p>

          {err && <div className="ftn-alert">{err}</div>}

          {/* Choix profil */}
          <div className="ftn-reg-grid">
            {OPTIONS.map((o) => {
              const active = accountType === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setAccountType(o.key)}
                  className={`ftn-reg-option accent-${o.accent} ${active ? "is-active" : ""}`}
                >
                  <div className="ftn-reg-top">
                    <span className="ftn-reg-dot" aria-hidden="true" />
                    <div className="ftn-reg-head">
                      <div className="ftn-reg-title">{o.title}</div>
                      <div className="ftn-reg-sub">{o.subtitle}</div>
                    </div>
                    <span className={`ftn-reg-check ${active ? "on" : ""}`}>{active ? "✓" : "○"}</span>
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

          {/* Form */}
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

            {/* SOCIÉTÉ */}
            {accountType === "societe" && (
              <>
                <div className="ftn-muted" style={{ marginTop: 12 }}>
                  Création de votre première <b>société</b> (obligatoire) pour émettre des <b>factures TTN</b>.
                </div>

                <label className="ftn-label">Nom de société</label>
                <input
                  className="ftn-input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Société Sana Com"
                />

                <label className="ftn-label">Matricule fiscal (optionnel)</label>
                <input
                  className="ftn-input"
                  value={companyTaxId}
                  onChange={(e) => setCompanyTaxId(e.target.value)}
                  placeholder="Ex: 1304544Z"
                />
              </>
            )}

            {/* CABINET */}
            {accountType === "cabinet" && (
              <>
                <div
                  className="ftn-callout"
                  style={{
                    marginTop: 12,
                    borderColor: "rgba(59,130,246,.25)",
                    background: "rgba(59,130,246,.06)",
                  }}
                >
                  <div className="ftn-callout-title">Cabinet (Comptable) — Gratuit après validation</div>
                  <div className="ftn-muted" style={{ marginTop: 6 }}>
                    Après vérification (MF / Patente), votre accès cabinet est activé.
                  </div>
                </div>

                <label className="ftn-label">Matricule fiscal du cabinet</label>
                <input
                  className="ftn-input"
                  value={accountantMf}
                  onChange={(e) => setAccountantMf(e.target.value)}
                  placeholder="MF cabinet"
                />

                <label className="ftn-label">Patente / identifiant cabinet</label>
                <input
                  className="ftn-input"
                  value={accountantPatente}
                  onChange={(e) => setAccountantPatente(e.target.value)}
                  placeholder="Patente cabinet"
                />
              </>
            )}

            {/* MULTI */}
            {accountType === "multi_societe" && (
              <div className="ftn-callout" style={{ marginTop: 12 }}>
                <div className="ftn-callout-title">Multi-société — gestion avancée</div>
                <div className="ftn-muted" style={{ marginTop: 6 }}>
                  Accès multi-entités : rôles avancés, équipes, et contrôle centralisé.
                </div>
              </div>
            )}

            {/* PROFIL COMPTA */}
            {accountType === "profil_compta" && (
              <div
                className="ftn-callout"
                style={{
                  marginTop: 12,
                  borderColor: "rgba(148,163,184,.28)",
                  background: "rgba(148,163,184,.08)",
                }}
              >
                <div className="ftn-callout-title">Profil Compta (Collaborateur)</div>
                <div className="ftn-muted" style={{ marginTop: 6 }}>
                  Ce profil est destiné aux collaborateurs. Les accès se font via <b>invitations</b>.
                </div>
              </div>
            )}

            {/* Terms */}
            <div className="ftn-terms">
              <label className="ftn-terms-row">
                <input
                  type="checkbox"
                  className="ftn-checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                />
                <span className="ftn-terms-text">
                  J&apos;ai lu et j&apos;accepte les{" "}
                  <Link className="ftn-link" href="/mentions-legales" target="_blank" rel="noopener noreferrer">
                    Mentions légales
                  </Link>{" "}
                  et les{" "}
                  <Link className="ftn-link" href="/conditions-generales" target="_blank" rel="noopener noreferrer">
                    Conditions générales
                  </Link>
                  .
                </span>
              </label>
              {!acceptTerms && <div className="ftn-terms-hint">Obligatoire pour créer un compte.</div>}
            </div>

            <button
              onClick={handleRegister}
              disabled={!canSubmit}
              className="ftn-btn"
              style={{ width: "100%", marginTop: 14 }}
            >
              {loading ? "Création..." : "Créer un compte"}
            </button>

            <div className="ftn-muted" style={{ marginTop: 12 }}>
              Déjà un compte ?{" "}
              <Link className="ftn-link" href="/login">
                Se connecter
              </Link>
              {plan ? (
                <>
                  {" "}
                  • Plan : <b>{plan}</b>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ftn-terms {
          margin-top: 14px;
          padding: 12px;
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.02);
        }
        .ftn-terms-row {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          cursor: pointer;
          user-select: none;
        }
        .ftn-checkbox {
          width: 18px;
          height: 18px;
          margin-top: 2px;
          accent-color: #111827;
        }
        .ftn-terms-text {
          font-size: 13px;
          color: rgba(15, 23, 42, 0.82);
          line-height: 1.35;
        }
        .ftn-link {
          text-decoration: underline;
          text-underline-offset: 3px;
          color: rgba(15, 23, 42, 0.92);
          font-weight: 650;
        }
        .ftn-link:hover {
          opacity: 0.85;
        }
        .ftn-terms-hint {
          margin-top: 8px;
          font-size: 12px;
          color: rgba(220, 38, 38, 0.9);
        }
      `}</style>
    </div>
  );
}
