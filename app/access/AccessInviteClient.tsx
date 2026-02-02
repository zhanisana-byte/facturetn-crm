"use client";

import { useEffect, useMemo, useState, ChangeEvent, FormEvent } from "react";
type Company = { id: string; name: string; role?: string };

type InviteKind = "client_management" | "page_management";
type PageRole = "owner" | "admin";
type ClientRole = "accountant" | "viewer" | "staff";

function presetFor(kind: InviteKind) {
  if (kind === "page_management") {
    return {
      can_manage_customers: false,
      can_create_invoices: false,
      can_validate_invoices: false,
      can_submit_ttn: false,
    };
  }
  
  return {
    can_manage_customers: true,
    can_create_invoices: true,
    can_validate_invoices: true,
    can_submit_ttn: true,
  };
}

export default function AccessInviteClient({ companies }: { companies: Company[] }) {
  const [invitedEmail, setInvitedEmail] = useState("");
  const [companyId, setCompanyId] = useState("");

  const [kind, setKind] = useState<InviteKind>("client_management");

  const [pageRole, setPageRole] = useState<PageRole>("admin");
  const [clientRole, setClientRole] = useState<ClientRole>("accountant");

  const role = useMemo(
    () => (kind === "page_management" ? pageRole : clientRole),
    [kind, pageRole, clientRole]
  );

  const [canManageCustomers, setCanManageCustomers] = useState(true);
  const [canCreateInvoices, setCanCreateInvoices] = useState(true);
  const [canValidateInvoices, setCanValidateInvoices] = useState(true);
  const [canSubmitTtn, setCanSubmitTtn] = useState(true);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const companiesSorted = useMemo(() => {
    return [...(companies ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [companies]);

  useEffect(() => {
    if (!companyId && companiesSorted.length) setCompanyId(companiesSorted[0].id);
  }, [companyId, companiesSorted]);

  useEffect(() => {
    const p = presetFor(kind);
    setCanManageCustomers(p.can_manage_customers);
    setCanCreateInvoices(p.can_create_invoices);
    setCanValidateInvoices(p.can_validate_invoices);
    setCanSubmitTtn(p.can_submit_ttn);
  }, [kind]);

  const objectiveLabel = useMemo(() => {
    return kind === "page_management"
      ? "Gestion PAGE (Owner/Admin)"
      : "Gestion SOCIÉTÉ (Factures/TTN)";
  }, [kind]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);

    const email = invitedEmail.trim().toLowerCase();
    if (!email) return setMsg("Email requis.");
    if (!companyId) return setMsg("Sélectionnez une société/page.");

    setLoading(true);
    try {
      const res = await fetch("/api/access-invitations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          invited_email: email,
          objective: kind, 
          role,
          can_manage_customers: kind === "client_management" ? canManageCustomers : false,
          can_create_invoices: kind === "client_management" ? canCreateInvoices : false,
          can_validate_invoices: kind === "client_management" ? canValidateInvoices : false,
          can_submit_ttn: kind === "client_management" ? canSubmitTtn : false,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Envoi impossible.");

      setMsg("Invitation envoyée  (copiez le lien si besoin)");
      if (json?.inviteLink) {
        
        try {
          await navigator.clipboard.writeText(String(json.inviteLink));
          setMsg("Invitation envoyée  Lien copié dans le presse-papiers.");
        } catch {
          
        }
      }
      setInvitedEmail("");
    } catch (err: any) {
      setMsg(err?.message || "Erreur.");
    } finally {
      setLoading(false);
    }
  }

  const showPerms = kind === "client_management";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="ftn-grid gap-3">
        <div>
          <div className="ftn-label">Société / Page</div>
          <select
            className="ftn-input w-full"
            value={companyId}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCompanyId(e.target.value)}
          >
            {companiesSorted.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="ftn-muted mt-1">Choisissez la page qui envoie l’invitation.</div>
        </div>

        <div>
          <div className="ftn-label">Email du destinataire</div>
          <input
            className="ftn-input w-full"
            value={invitedEmail}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setInvitedEmail(e.target.value)}
            placeholder="email@exemple.com"
            inputMode="email"
            autoComplete="email"
          />
        </div>
      </div>

      <div className="ftn-grid gap-3">
        <div>
          <div className="ftn-label">Type d’invitation</div>
          <select
            className="ftn-input w-full"
            value={kind}
            onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setKind(e.target.value as InviteKind)}
          >
            <option value="client_management">Gestion SOCIÉTÉ (Factures/TTN)</option>
            <option value="page_management">Gestion PAGE (Owner/Admin)</option>
          </select>
          <div className="ftn-muted mt-1">{objectiveLabel}</div>
        </div>

        <div>
          <div className="ftn-label">Rôle</div>
          {kind === "page_management" ? (
            <select
              className="ftn-input w-full"
              value={pageRole}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setPageRole(e.target.value as PageRole)}
            >
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          ) : (
            <select
              className="ftn-input w-full"
              value={clientRole}
              onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setClientRole(e.target.value as ClientRole)}
            >
              <option value="accountant">Comptable / Gestion client</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
          )}
        </div>
      </div>

      {showPerms ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="font-semibold mb-2">Permissions (Gestion société)</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canManageCustomers}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCanManageCustomers(e.target.checked)}
              />
              Gérer clients
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canCreateInvoices}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCanCreateInvoices(e.target.checked)}
              />
              Créer factures
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canValidateInvoices}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCanValidateInvoices(e.target.checked)}
              />
              Valider factures
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canSubmitTtn}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCanSubmitTtn(e.target.checked)}
              />
              Soumettre TTN
            </label>
          </div>
          <div className="ftn-muted mt-2">
            Les permissions sont utilisées uniquement pour l’accès “Gestion Société”.
          </div>
        </div>
      ) : (
        <div className="ftn-muted">
          Pour “Gestion Page”, on attribue un rôle <b>Owner/Admin</b>. Les permissions facturation
          ne s’appliquent pas.
        </div>
      )}

      <div className="flex items-center gap-2">
        <button className="ftn-btn" type="submit" disabled={loading}>
          {loading ? "Envoi..." : "Envoyer invitation"}
        </button>
        {msg ? <span className="text-sm">{msg}</span> : null}
      </div>
    </form>
  );
}
