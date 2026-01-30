"use client";

import { useEffect, useMemo, useState, ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; company_name?: string | null };

type Props = {
  // optional: preselect company
  defaultCompanyId?: string | null;
};

export default function CreateInvitationForm({ defaultCompanyId = null }: Props) {
  const supabase = createClient();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyId, setCompanyId] = useState<string>(defaultCompanyId ?? "");
  const [email, setEmail] = useState("");
  const [objective, setObjective] = useState("");

  const [canManageCustomers, setCanManageCustomers] = useState(false);
  const [canCreateInvoices, setCanCreateInvoices] = useState(true);
  const [canValidateInvoices, setCanValidateInvoices] = useState(false);
  const [canSubmitTtn, setCanSubmitTtn] = useState(false);

  const [role, setRole] = useState<"accountant" | "staff" | "viewer">("accountant");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadCompanies() {
      setLoading(true);
      setError(null);

      // companies visible to the user via memberships
      const { data, error } = await supabase
        .from("memberships")
        .select("company_id, companies(id, company_name)")
        .eq("is_active", true);

      if (!mounted) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const rows: any[] = data ?? [];
      const unique = new Map<string, Company>();
      for (const r of rows) {
        const c = (r as any).companies;
        if (c?.id) unique.set(c.id, { id: c.id, company_name: c.company_name });
        else if (r.company_id) unique.set(r.company_id, { id: r.company_id, company_name: null });
      }

      const list = Array.from(unique.values());
      setCompanies(list);

      if (!companyId) {
        const first = list[0]?.id;
        if (first) setCompanyId(first);
      }

      setLoading(false);
    }

    loadCompanies();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSend = useMemo(() => {
    return !!companyId && email.trim().length > 4 && email.includes("@");
  }, [companyId, email]);

  async function submit() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/access-invitations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          invited_email: email.trim().toLowerCase(),
          objective: objective.trim() || null,
          role,
          can_manage_customers: canManageCustomers,
          can_create_invoices: canCreateInvoices,
          can_validate_invoices: canValidateInvoices,
          can_submit_ttn: canSubmitTtn,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Impossible de créer l'invitation.");
      }

      const link = json?.inviteLink ? String(json.inviteLink) : "";
      setSuccess(link ? `Invitation créée ✅ Lien: ${link}` : "Invitation créée ✅");
      setEmail("");
      setObjective("");
    } catch (e: any) {
      setError(e?.message || "Erreur inconnue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ftn-card ftn-card-green">
      <div className="ftn-card-title" style={{ marginBottom: 8 }}>
        Inviter un membre / comptable
      </div>
      <div className="ftn-muted" style={{ marginBottom: 14 }}>
        Choisis une société, puis envoie une invitation par email.
      </div>

      {error ? (
        <div className="ftn-badge" style={{ marginBottom: 10 }}>
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="ftn-badge" style={{ marginBottom: 10 }}>
          {success}
        </div>
      ) : null}

      <label className="ftn-label">Société</label>
      {loading ? (
        <div className="ftn-muted">Chargement des sociétés…</div>
      ) : (
        <select
          className="ftn-input"
          value={companyId}
          onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCompanyId(e.target.value)}
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company_name ? `${c.company_name}` : c.id}
            </option>
          ))}
        </select>
      )}

      <label className="ftn-label">Email à inviter</label>
      <input
        className="ftn-input"
        placeholder="ex: comptable@cabinet.tn"
        value={email}
        onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEmail(e.target.value)}
      />

      <label className="ftn-label">Objectif (optionnel)</label>
      <input
        className="ftn-input"
        placeholder="ex: Gestion TTN / Création factures"
        value={objective}
        onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setObjective(e.target.value)}
      />

      <div className="ftn-grid" style={{ marginTop: 12, gap: 10 }}>
        <div>
          <label className="ftn-label">Rôle</label>
          <select className="ftn-input" value={role} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setRole(e.target.value as any)}>
            <option value="accountant">Comptable</option>
            <option value="staff">Staff</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>

        <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
          <label className="text-sm" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={canManageCustomers} onChange={(e: ChangeEvent<HTMLInputElement>) => setCanManageCustomers(e.target.checked)} />
            Gérer clients
          </label>
          <label className="text-sm" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={canCreateInvoices} onChange={(e: ChangeEvent<HTMLInputElement>) => setCanCreateInvoices(e.target.checked)} />
            Créer factures
          </label>
          <label className="text-sm" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={canValidateInvoices} onChange={(e: ChangeEvent<HTMLInputElement>) => setCanValidateInvoices(e.target.checked)} />
            Valider factures
          </label>
          <label className="text-sm" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={canSubmitTtn} onChange={(e: ChangeEvent<HTMLInputElement>) => setCanSubmitTtn(e.target.checked)} />
            Soumettre TTN
          </label>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <button className="ftn-btn" disabled={!canSend || busy} onClick={submit} type="button">
          {busy ? "Envoi…" : "Créer l'invitation"}
        </button>
      </div>
    </div>
  );
}
