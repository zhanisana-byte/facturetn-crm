"use client";

import { useState } from "react";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/client";

export default function CabinetValidationPage() {
  const supabase = createClient();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function uploadPatente() {
    setErr(null);
    setMsg(null);

    if (!file) {
      setErr("Veuillez choisir un fichier (PDF/JPG/PNG).");
      return;
    }

    setLoading(true);

    // 1) get user
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      setLoading(false);
      setErr("Non connecté.");
      return;
    }

    // 2) upload to storage
    const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
    const path = `patente/${user.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("kyc")
      .upload(path, file, { upsert: true });

    if (upErr) {
      setLoading(false);
      setErr("Upload échoué: " + upErr.message);
      return;
    }

    // 3) get signed url (private bucket)
    const { data: signed, error: sErr } = await supabase.storage
      .from("kyc")
      .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 an

    if (sErr || !signed?.signedUrl) {
      setLoading(false);
      setErr("URL échouée: " + (sErr?.message || ""));
      return;
    }

    // 4) save url in app_users.accountant_patente + mettre status pending (reste pending jusqu’à admin)
    const { error: uErr } = await supabase
      .from("app_users")
      .update({
        accountant_patente: signed.signedUrl,
        accountant_status: "pending",
      })
      .eq("id", user.id);

    setLoading(false);

    if (uErr) {
      setErr("Sauvegarde échouée: " + uErr.message);
      return;
    }

    setMsg("Patente envoyée ✅ Votre cabinet sera validé sous peu.");
  }

  return (
    <AppShell
      title="Validation Cabinet"
      subtitle="Créez votre cabinet gratuitement — pour activer la gestion clients et TTN, veuillez déposer votre patente."
      accountType={"cabinet" as any}
    >
      <div className="max-w-xl">
        <div className="ftn-card">
          <div className="ftn-muted">
            <b className="ftn-strong">Avantage :</b> vous pouvez gérer votre cabinet gratuitement (1 société cabinet).
            <br />
            <b className="ftn-strong">Activation :</b> pour inviter des clients et activer TTN, la validation est requise.
          </div>

          <div style={{ marginTop: 14 }}>
            <label className="ftn-label">Patente (PDF/JPG/PNG)</label>
            <input
              className="ftn-input"
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          {err && <div className="ftn-alert" style={{ marginTop: 12 }}>{err}</div>}
          {msg && (
            <div
              className="ftn-alert"
              style={{
                marginTop: 12,
                background: "rgba(16,185,129,.10)",
                borderColor: "rgba(16,185,129,.25)",
                color: "rgba(6,95,70,.95)",
              }}
            >
              {msg}
            </div>
          )}

          <button className="ftn-btn" style={{ marginTop: 12 }} disabled={loading} onClick={uploadPatente}>
            {loading ? "Envoi..." : "Envoyer la patente"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
