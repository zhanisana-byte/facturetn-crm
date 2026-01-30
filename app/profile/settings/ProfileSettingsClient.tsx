"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export default function ProfileSettingsClient() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      setMsg(null);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        setLoading(false);
        setErr("Session expirée. Veuillez vous reconnecter.");
        return;
      }

      const { data, error } = await supabase
        .from("app_users")
        .select("id, full_name, email")
        .eq("id", user.id)
        .single();

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      const row = data as ProfileRow;
      setProfile(row);
      setFullName(row.full_name ?? "");
      setEmail(row.email ?? user.email ?? "");
      setLoading(false);
    })();
  }, [supabase]);

  async function saveProfile() {
    if (!profile) return;

    setSaving(true);
    setErr(null);
    setMsg(null);

    try {
      // 1) update full_name in app_users
      const { error: e1 } = await supabase
        .from("app_users")
        .update({ full_name: fullName || null, updated_at: new Date().toISOString() })
        .eq("id", profile.id);

      if (e1) throw e1;

      // 2) update email (auth)
      const targetEmail = email.trim();
      const currentEmail = (profile.email ?? "").trim();

      if (targetEmail && targetEmail !== currentEmail) {
        const { error: e2 } = await supabase.auth.updateUser({ email: targetEmail });
        if (e2) throw e2;

        // On garde aussi app_users.email à jour
        const { error: e3 } = await supabase
          .from("app_users")
          .update({ email: targetEmail, updated_at: new Date().toISOString() })
          .eq("id", profile.id);

        if (e3) throw e3;

        setMsg("Profil mis à jour. Un email de confirmation peut être requis pour valider le nouvel email.");
      } else {
        setMsg("Profil mis à jour avec succès.");
      }
    } catch (e: any) {
      setErr(e?.message ?? "Erreur lors de la mise à jour.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setErr(null);
    setMsg(null);

    if (!newPassword || newPassword.length < 6) {
      setErr("Mot de passe trop court (minimum 6 caractères).");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr("Confirmation du mot de passe incorrecte.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setNewPassword("");
      setConfirmPassword("");
      setMsg("Mot de passe mis à jour avec succès.");
    } catch (e: any) {
      setErr(e?.message ?? "Impossible de modifier le mot de passe.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="ftn-muted">Chargement…</div>;
  }

  return (
    <div className="ftn-wrap">
      {(err || msg) && (
        <div className={err ? "ftn-alert" : "ftn-callout"}>
          <div className={err ? "" : "ftn-strong"}>{err ? err : msg}</div>
        </div>
      )}

      <div className="ftn-card-lux ftn-reveal">
        <div className="ftn-card-head">
          <div className="ftn-card-titleRow">
            <div className="ftn-ic">⚙️</div>
            <div>
              <div className="ftn-card-title">Paramètres du profil</div>
              <div className="ftn-card-sub">Modifiez vos informations et votre mot de passe</div>
            </div>
          </div>
        </div>

        <div className="ftn-card-body">
          <label className="ftn-label">Nom complet</label>
          <input className="ftn-input" value={fullName} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFullName(e.target.value)} placeholder="Votre nom" />

          <label className="ftn-label">Email</label>
          <input className="ftn-input" value={email} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEmail(e.target.value)} placeholder="email@exemple.com" />

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="ftn-btn" onClick={saveProfile} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <a className="ftn-btn-ghost" href="/dashboard">
              Retour au dashboard
            </a>
          </div>
        </div>
      </div>

      <div className="ftn-card-lux ftn-reveal">
        <div className="ftn-card-head">
          <div className="ftn-card-titleRow">
            <div className="ftn-ic">🔒</div>
            <div>
              <div className="ftn-card-title">Sécurité</div>
              <div className="ftn-card-sub">Changer votre mot de passe</div>
            </div>
          </div>
        </div>

        <div className="ftn-card-body">
          <label className="ftn-label">Nouveau mot de passe</label>
          <input className="ftn-input" type="password" value={newPassword} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setNewPassword(e.target.value)} />

          <label className="ftn-label">Confirmer</label>
          <input className="ftn-input" type="password" value={confirmPassword} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setConfirmPassword(e.target.value)} />

          <div style={{ marginTop: 12 }}>
            <button className="ftn-btn" onClick={changePassword} disabled={saving}>
              {saving ? "Mise à jour…" : "Mettre à jour le mot de passe"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
