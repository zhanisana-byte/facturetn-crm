"use client";

import { useState, ChangeEvent } from "react";
export default function CreateGroupInvitationForm({
  groupId,
  onCreated,
}: {
  groupId: string;
  onCreated?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [objective, setObjective] = useState("");
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setLink(null);
    try {
      const res = await fetch("/api/group-invitations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: groupId,
          invited_email: email,
          role,
          objective,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j?.error || "Erreur.");
        return;
      }
      setEmail("");
      setObjective("");
      setLink(j?.inviteLink || null);
      onCreated?.();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ftn-card">
      <div className="ftn-card-title">Inviter un membre (Groupe)</div>
      <div className="ftn-grid" style={{ gap: 10 }}>
        <input className="ftn-input" placeholder="Email" value={email} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEmail(e.target.value)} />
        <select className="ftn-input" value={role} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setRole(e.target.value as any)}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <input
          className="ftn-input"
          placeholder="Objet (optionnel)"
          value={objective}
          onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setObjective(e.target.value)}
        />
        <button className="ftn-btn" disabled={loading || !email} onClick={submit}>
          Envoyer l&apos;invitation
        </button>
        {link ? (
          <div className="text-xs opacity-80">
            Lien: <span className="underline break-all">{link}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
