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
    title: "Client — Facture TTN",
    subtitle: "Auto-entrepreneur, freelance, petite société",
    bullets: [
      "Facture TTN conforme Tunisie",
      "Gestion simple (1 société)",
      "Inviter équipe ou comptable",
    ],
    accent: "orange",
  },
  {
    key: "cabinet",
    title: "Cabinet comptable — Facture TTN",
    subtitle: "Accès Cabinet (Comptable) — Gratuit après validation",
    bullets: [
      "Accès cabinet Facture TTN (gratuit)",
      "Gérer les factures TTN des clients",
      "Inviter équipe & collaborateurs",
    ],
    accent: "blue",
  },
  {
    key: "groupe",
    title: "Groupe — Facture TTN",
    subtitle: "Multi-sociétés & gestion avancée (forfait)",
    bullets: [
      "Facture TTN multi-sociétés",
      "Équipe interne & rôles avancés",
      "Comptable externe & reporting",
    ],
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

  // Client: création société immédiate
  const [companyName, setCompanyName] = useState("");
  const [companyTaxId, setCompanyTaxId] = useState("");

  // Cabinet: infos validation
  const [accountantMf, setAccountantMf] = useState("");
  const [accountantPatente, setAccountantPatente] = useState("");

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
      !loading;

    if (!baseOk) return false;

    if (accountType === "client") {
      return companyName.trim().length > 1;
    }

    if (accountType === "cabinet") {
      return accountantMf.trim().length > 3 && accountantPatente.trim().length > 2;
    }

    // groupe
    return true;
  }, [
    email,
    fullName,
    password,
    loading,
    accountType,
    companyName,
    accountantMf,
    accountantPatente,
  ]);

  async function handleRegister() {
    setErr(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return setErr("Email obligatoire.");
    if (!password || password.length < 8)
      return setErr("Mot de passe : minimum 8 caractères.");
    if (!fullName.trim()) return setErr("Nom complet obligatoire.");

    if (accountType === "client" && !companyName.trim()) {
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

    // 2) Upsert app_users
    const userPayload: any = {
      id: userId,
      email: cleanEmail,
      full_name: fullName.trim(),
      account_type: accountType,
      role: "user",
      is_active: true,

      // Plan (interne)
      plan_code: accountType === "groupe" ? "group_unlimited" : "client_50",
      max_companies: accountType === "groupe" ? 999 : 1,
      subscription_status: "active",
    };

    if (accountType === "cabinet") {
      userPayload.accountant_mf = accountantMf.trim();
      userPayload.accountant_patente = accountantPatente.trim();
      userPayload.accountant_status = "pending";
      userPayload.accountant_free_access = false; // sera activé après validation admin
    }

    const { error: upErr } = await supabase
      .from("app_users")
      .upsert(userPayload, { onConflict: "id" });

    if (upErr) {
      setLoading(false);
      setErr("Profil non enregistré : " + upErr.message);
      return;
    }

    // 3) Créer société selon accountType

    // ✅ CLIENT: créer société + membership owner (Facture TTN)
    if (accountType === "client") {
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
      });

      if (mErr) {
        setLoading(false);
        setErr("Société créée, mais accès non créé : " + mErr.message);
        return;
      }
    }

    // ✅ CABINET: pas de société tant que pending
    // ✅ GROUPE: setup plus tard

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
            Choisissez votre profil Facture TTN, puis complétez les informations.
          </p>

          {err && <div className="ftn-alert">{err}</div>}

          {/* Choix profil (3 cartes) */}
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

            {/* CLIENT */}
            {accountType === "client" && (
              <>
                <div className="ftn-muted" style={{ marginTop: 12 }}>
                  Vous allez créer votre première société pour émettre des <b>Factures TTN</b>.
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
                  <div className="ftn-callout-title">
                    Accès Cabinet (Comptable) — Gratuit après validation
                  </div>
                  <div className="ftn-muted" style={{ marginTop: 6 }}>
                    Après vérification (MF / Patente), votre accès cabinet est activé pour
                    gérer les <b>Factures TTN</b> de vos clients.
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

            {/* GROUPE */}
            {accountType === "groupe" && (
              <div className="ftn-callout" style={{ marginTop: 12 }}>
                <div className="ftn-callout-title">Groupe — Facture TTN multi-sociétés</div>
                <div className="ftn-muted" style={{ marginTop: 6 }}>
                  Idéal pour holdings et structures multi-entités : rôles avancés,
                  équipes internes, et gestion centralisée des <b>Factures TTN</b>.
                </div>
              </div>
            )}

            <button
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
          </div>
        </div>
      </div>
    </div>
  );
}
