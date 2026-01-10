"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; company_name: string; tax_id?: string | null };

function labelAccountType(t?: string) {
  if (t === "entreprise") return "Entreprise";
  if (t === "multi_societe") return "Groupe / Multi-sociétés";
  if (t === "comptable") return "Comptable";
  return t || "—";
}

export default function ProfileClient({
  initial,
  companies,
}: {
  initial: any;
  companies: Company[];
}) {
  const supabase = useMemo(() => createClient(), []);

  // Basic profile
  const [fullName, setFullName] = useState(initial?.full_name ?? "");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Accountant validation fields (for accountant type only)
  const [accountantMf, setAccountantMf] = useState(initial?.accountant_mf ?? "");
  const [accountantPatente, setAccountantPatente] = useState(initial?.accountant_patente ?? "");

  // Invite accountant (for entreprise / multi_societe)
  const isAccountant = initial?.account_type === "comptable";
  const [invCompanyId, setInvCompanyId] = useState(companies?.[0]?.id ?? "");
  const [invEmail, setInvEmail] = useState("");
  const [canManageCustomers, setCanManageCustomers] = useState(false);
  const [canCreateInvoices, setCanCreateInvoices] = useState(true);
  const [canValidateInvoices, setCanValidateInvoices] = useState(true);
  const [canSubmitTtn, setCanSubmitTtn] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  async function saveProfile() {
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Non connecté");

      const patch: any = { full_name: fullName };
      if (isAccountant) {
        patch.accountant_mf = accountantMf || null;
        patch.accountant_patente = accountantPatente || null;
      }

      const { error } = await supabase.from("app_users").update(patch).eq("id", auth.user.id);
      if (error) throw error;
      setMsg("Profil mis à jour ✅");
    } catch (e: any) {
      setErr(e?.message ?? "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function createInvitation() {
    setInviteLoading(true);
    setInviteLink(null);
    setErr(null);
    setMsg(null);
    try {
      if (!invCompanyId) throw new Error("Choisissez une société");
      if (!invEmail.trim()) throw new Error("Email du comptable requis");

      const res = await fetch("/api/access-invitations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: invCompanyId,
          invited_email: invEmail,
          role: "accountant",
          can_manage_customers: canManageCustomers,
          can_create_invoices: canCreateInvoices,
          can_validate_invoices: canValidateInvoices,
          can_submit_ttn: canSubmitTtn,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Erreur création invitation");

      setInviteLink(json.inviteLink);
      setMsg("Invitation créée ✅ (copiez le lien ou envoyez-le par email)");
      setInvEmail("");
    } catch (e: any) {
      setErr(e?.message ?? "Erreur");
    } finally {
      setInviteLoading(false);
    }
  }

  return (
    <div className="ftn-grid max-w-5xl">
      {/* PROFILE SUMMARY */}
      <div className="ftn-card">
        <div className="ftn-card-title">Votre profil</div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="ftn-label">Nom complet</label>
            <input className="ftn-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label className="ftn-label">Email</label>
            <input className="ftn-input" value={initial?.email ?? ""} readOnly />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="ftn-badge">Type: {labelAccountType(initial?.account_type)}</span>
          <span className="ftn-badge">Max sociétés: {initial?.max_companies ?? 1}</span>
          {/* Plan interne masqué dans l'UI (on affiche plutôt le statut abonnement) */}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="ftn-btn-ghost" href="/onboarding">
            Modifier type de compte
          </Link>
          <Link className="ftn-btn-ghost" href="/forgot-password">
            Modifier mot de passe
          </Link>
        </div>

        {isAccountant ? (
          <div className="mt-7">
            <div className="ftn-card-title">Validation comptable</div>
            <p className="ftn-muted mt-2">
              Statut: <b className="text-slate-900">{initial?.accountant_status ?? "pending"}</b>
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="ftn-label">MF</label>
                <input className="ftn-input" value={accountantMf} onChange={(e) => setAccountantMf(e.target.value)} />
              </div>
              <div>
                <label className="ftn-label">Patente</label>
                <input className="ftn-input" value={accountantPatente} onChange={(e) => setAccountantPatente(e.target.value)} />
              </div>
            </div>
          </div>
        ) : null}

        {err ? <div className="ftn-alert mt-5">{err}</div> : null}
        {msg ? (
          <div
            className="mt-5 rounded-2xl px-4 py-3 text-sm border"
            style={{
              borderColor: "rgba(34,197,94,.25)",
              background: "rgba(34,197,94,.08)",
              color: "rgba(21,128,61,1)",
            }}
          >
            {msg}
          </div>
        ) : null}

        <button className="ftn-btn mt-5" onClick={saveProfile} disabled={loading}>
          {loading ? "Enregistrement..." : "Sauvegarder"}
        </button>
      </div>

      {/* INVITE ACCOUNTANT (Entreprise / Groupe) */}
      {!isAccountant ? (
        <div className="ftn-card">
          <div className="ftn-card-title">Accès comptable</div>
          <p className="ftn-muted mt-2">
            Ajoutez un comptable externe à une société. Le comptable accepte l’invitation via un lien.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="ftn-label">Société</label>
              <select className="ftn-input" value={invCompanyId} onChange={(e) => setInvCompanyId(e.target.value)}>
                <option value="">— Choisir —</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name} {c.tax_id ? `(${c.tax_id})` : ""}
                  </option>
                ))}
              </select>
              {companies?.length === 0 ? (
                <div className="mt-2 text-xs" style={{ color: "rgba(15, 23, 42, .62)" }}>
                  Aucune société trouvée. Créez d’abord une société dans “Sociétés”.
                </div>
              ) : null}
            </div>

            <div>
              <label className="ftn-label">Email du comptable</label>
              <input
                className="ftn-input"
                value={invEmail}
                onChange={(e) => setInvEmail(e.target.value)}
                placeholder="ex: comptable@cabinet.tn"
              />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "rgba(148,163,184,.28)", background: "rgba(255,255,255,.62)" }}>
            <div className="text-sm font-semibold">Permissions</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={canManageCustomers} onChange={(e) => setCanManageCustomers(e.target.checked)} />
                Gérer clients
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={canCreateInvoices} onChange={(e) => setCanCreateInvoices(e.target.checked)} />
                Créer factures
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={canValidateInvoices} onChange={(e) => setCanValidateInvoices(e.target.checked)} />
                Valider factures
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={canSubmitTtn} onChange={(e) => setCanSubmitTtn(e.target.checked)} />
                Envoyer TTN (plus tard)
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="ftn-btn" onClick={createInvitation} disabled={inviteLoading || !invCompanyId}>
              {inviteLoading ? "Création..." : "Créer invitation"}
            </button>
            {inviteLink ? (
              <button
                className="ftn-btn-ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(inviteLink);
                  setMsg("Lien copié ✅");
                }}
              >
                Copier le lien
              </button>
            ) : null}
          </div>

          {inviteLink ? (
            <div className="mt-4">
              <label className="ftn-label">Lien d’invitation</label>
              <input className="ftn-input" value={inviteLink} readOnly />
              <div className="mt-2 text-xs" style={{ color: "rgba(15, 23, 42, .62)" }}>
                Vous pouvez envoyer ce lien au comptable par email/WhatsApp. (Envoi email automatique: étape suivante)
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* SUBSCRIPTION (placeholder) */}
      <div className="ftn-card">
        <div className="ftn-card-title">Abonnement</div>
        <p className="ftn-muted mt-2">
          Offre de démarrage gratuite à partir de l’inscription. Ensuite, abonnement selon votre formule.
        </p>
        <div className="mt-3">
          <Link className="ftn-link" href="/subscription">Ouvrir la page abonnement</Link>
        </div>
      </div>
    </div>
  );
}
