"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";

export default function InvitationsPage() {
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);

  function togglePermission(p: string) {
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  return (
    <AppShell
      title="Invitations"
      subtitle="Inviter une personne et définir ses permissions"
      accountType="comptable"
    >
      <div className="card max-w-xl">
        <h3 className="card-title">➕ Nouvelle invitation</h3>

        <label className="label">Email</label>
        <input
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@exemple.com"
        />

        <div className="mt-4">
          <p className="label">Permissions</p>

          {[
            "Créer factures",
            "Modifier factures",
            "Envoyer TTN",
            "Gérer clients",
            "Contrôle total",
          ].map((p) => (
            <label key={p} className="checkbox">
              <input
                type="checkbox"
                checked={permissions.includes(p)}
                onChange={() => togglePermission(p)}
              />
              <span>{p}</span>
            </label>
          ))}
        </div>

        <button className="btn-primary mt-6">
          Envoyer l’invitation
        </button>
      </div>

      <div className="card mt-6">
        <h3 className="card-title">📨 Invitations envoyées</h3>
        <p className="muted">
          Liste des invitations en attente ou acceptées.
        </p>
      </div>
    </AppShell>
  );
}
