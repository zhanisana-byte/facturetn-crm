"use client";

import { useMemo, useState, ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type ActiveMode = "profil" | "entreprise" | "comptable" | "multi_societe";

function splitName(full: string) {
  const v = String(full || "").trim();
  if (!v) return { first: "", last: "" };
  const parts = v.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export default function ProfileClient({
  initialUser,
  activeMode,
  group,
}: {
  initialUser: any;
  activeMode: ActiveMode;
  group?: any | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const n = splitName(initialUser?.full_name ?? "");
  const [firstName, setFirstName] = useState(n.first);
  const [lastName, setLastName] = useState(n.last);

  const [groupName, setGroupName] = useState(group?.group_name ?? "");

  const [savingUser, setSavingUser] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);

  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function saveUser() {
    setSavingUser(true);
    setOk(null);
    setErr(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Non connecté.");

      const fn = firstName.trim();
      const ln = lastName.trim();
      const full = [fn, ln].filter(Boolean).join(" ").trim();

      const { error } = await supabase
        .from("app_users")
        .update({ full_name: full })
        .eq("id", auth.user.id);

      if (error) throw error;

      setOk("Profil mis à jour.");
    } catch (e: any) {
      setErr(e?.message || "Erreur.");
    } finally {
      setSavingUser(false);
    }
  }

  async function saveGroup() {
    if (!group?.id) return;
    setSavingGroup(true);
    setOk(null);
    setErr(null);
    try {
      const name = groupName.trim();
      if (!name) throw new Error("Nom du groupe obligatoire.");

      const { error } = await supabase
        .from("groups")
        .update({ group_name: name })
        .eq("id", group.id);

      if (error) throw error;

      setOk("Profil Groupe mis à jour.");
    } catch (e: any) {
      setErr(e?.message || "Erreur.");
    } finally {
      setSavingGroup(false);
    }
  }

  return (
    <div className="ftn-grid">
      {ok ? <div className="ftn-alert tone-ok">{ok}</div> : null}
      {err ? <div className="ftn-alert tone-bad">{err}</div> : null}

      {}
      <div className="ftn-card">
        <div className="ftn-card-title">Profil</div>

        <div className="mt-3 ftn-grid" style={{ gap: 12 }}>
          <div>
            <label className="ftn-label">Nom</label>
            <input
              className="ftn-input"
              value={lastName}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setLastName(e.target.value)}
              placeholder="Nom"
            />
          </div>

          <div>
            <label className="ftn-label">Prénom</label>
            <input
              className="ftn-input"
              value={firstName}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFirstName(e.target.value)}
              placeholder="Prénom"
            />
          </div>
        </div>

        <div className="mt-4 ftn-row">
          <div className="ftn-muted">
            Type : <b className="ftn-strong">{activeMode === "multi_societe" ? "Groupe / Multi-sociétés" : "Profil Pro"}</b>
          </div>
          <div className="ftn-muted">
            Email : <b className="ftn-strong">{initialUser?.email || "—"}</b>
          </div>
        </div>

        <div className="mt-5">
          <button className="ftn-btn" onClick={saveUser} disabled={savingUser}>
            {savingUser ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>

      {}
      {activeMode === "multi_societe" && group ? (
        <div className="ftn-card">
          <div className="ftn-card-title">Profil Groupe</div>
          <p className="ftn-muted mt-2">
            Paramètres du groupe actif (Multi-société).
          </p>

          <div className="mt-4">
            <label className="ftn-label">Nom du groupe</label>
            <input
              className="ftn-input"
              value={groupName}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setGroupName(e.target.value)}
              placeholder="Ex: Holding ABC"
            />
          </div>

          <div className="mt-5">
            <button className="ftn-btn" onClick={saveGroup} disabled={savingGroup}>
              {savingGroup ? "Enregistrement..." : "Enregistrer le groupe"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
