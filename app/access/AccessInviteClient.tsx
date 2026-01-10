"use client";

import { useState } from "react";

type Company = { id: string; name: string; role?: string };

export default function AccessInviteClient({ companies }: { companies: Company[] }) {
  const [email, setEmail] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/access-invitations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          invited_email: email,
          role: "accountant",
          permissions: {
            invoices_view: true,
            invoices_create: true,
            invoices_edit: true,
            ttn_send: true,
            settings: false,
            users: false,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Erreur envoi invitation");
      setMsg("Invitation envoyée ✅");
      setEmail("");
    } catch (err: any) {
      setMsg(err?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="ftn-form">
      <div className="ftn-form-row">
        <label className="ftn-label">Email du comptable</label>
        <input
          className="ftn-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
          placeholder="ex: hamdi@cabinet.tn"
        />
      </div>

      <div className="ftn-form-row">
        <label className="ftn-label">Société</label>
        <select className="ftn-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
          <option value="">Choisir…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.role ? `(${c.role})` : ""}
            </option>
          ))}
        </select>
        <div className="ftn-muted mt-1">L’invitation crée un lien d’accès sécurisé.</div>
      </div>

      <div className="ftn-form-row">
        <label className="ftn-label">Permissions (V2)</label>
        <div className="ftn-perms">
          <label className="ftn-check"><input type="checkbox" defaultChecked disabled /> Voir factures</label>
          <label className="ftn-check"><input type="checkbox" defaultChecked disabled /> Créer factures</label>
          <label className="ftn-check"><input type="checkbox" defaultChecked disabled /> Modifier factures</label>
          <label className="ftn-check"><input type="checkbox" defaultChecked disabled /> Envoyer TTN</label>
          <label className="ftn-check"><input type="checkbox" disabled /> Paramètres société</label>
          <label className="ftn-check"><input type="checkbox" disabled /> Gérer utilisateurs</label>
        </div>
        <div className="ftn-muted mt-2">Dans V3, on rendra ces cases configurables et stockées en SQL.</div>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button className="ftn-btn" type="submit" disabled={loading}>
          {loading ? "Envoi..." : "Envoyer invitation"}
        </button>
        {msg ? <span className="text-sm">{msg}</span> : null}
      </div>
    </form>
  );
}
