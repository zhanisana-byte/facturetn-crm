"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, Table, Badge, Btn } from "@/components/ui";

type InviteRow = {
  id: string;
  invited_email: string;
  role: string;
  objective: string;
  status: string;
  expires_at: string | null;
  created_at: string | null;
  token?: string | null;
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(v));
  } catch {
    return String(v).slice(0, 10);
  }
}

export default function InvitationsSocieteClient({
  companyId,
  companyName,
  isManager,
  initialInvitations,
}: {
  companyId: string;
  companyName: string;
  isManager: boolean;
  initialInvitations: InviteRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [objective, setObjective] = useState<"client_management" | "page_management">("client_management");
  const [role, setRole] = useState<string>("accountant");
  const [perms, setPerms] = useState({
    can_manage_customers: true,
    can_create_invoices: false,
    can_validate_invoices: false,
    can_submit_ttn: false,
  });

  const rows = useMemo(() => initialInvitations ?? [], [initialInvitations]);

  async function createInvite() {
    setErr(null);
    setOk(null);

    const invited_email = email.trim().toLowerCase();
    if (!invited_email) {
      setErr("Email requis");
      return;
    }

    const payload: any = {
      company_id: companyId,
      invited_email,
      objective,
      role,
      ...perms,
    };

    // gestion page: pas de permissions, role owner/admin
    if (objective === "page_management") {
      payload.can_manage_customers = false;
      payload.can_create_invoices = false;
      payload.can_validate_invoices = false;
      payload.can_submit_ttn = false;
    }

    const res = await fetch("/api/access-invitations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j?.error || "Erreur création invitation");
      return;
    }

    setOk(j?.inviteLink ? `Invitation créée. Lien: ${j.inviteLink}` : "Invitation créée.");
    setEmail("");
  }

  async function cancelInvite(id: string) {
    setErr(null);
    setOk(null);

    const res = await fetch("/api/access-invitations/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j?.error || "Erreur annulation");
      return;
    }

    setOk("Invitation annulée.");
    // refresh simple: reload page
    window.location.reload();
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      <Card title="Invitations" subtitle={`Société: ${companyName}`}
      >
        <div className="text-xs text-slate-500">
          Objectif <b>Gestion société</b> = équipe comptable (permissions). Objectif <b>Gestion page</b> = Owner/Admin.
        </div>
      </Card>

      {err ? <div className="ftn-alert tone-bad">{err}</div> : null}
      {ok ? <div className="ftn-alert tone-good">{ok}</div> : null}

      <Card
        title="Envoyer une invitation"
        subtitle={isManager ? "Inviter par email" : "Lecture seule (Owner/Admin requis)"}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="client@exemple.com"
              disabled={!isManager || pending}
            />
          </label>

          <label className="text-sm">
            Objectif
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={objective}
              onChange={(e) => {
                const v = e.target.value as any;
                setObjective(v);
                setRole(v === "page_management" ? "admin" : "accountant");
              }}
              disabled={!isManager || pending}
            >
              <option value="client_management">Gestion société</option>
              <option value="page_management">Gestion page</option>
            </select>
          </label>

          <label className="text-sm">
            Rôle
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={!isManager || pending}
            >
              {objective === "page_management" ? (
                <>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </>
              ) : (
                <>
                  <option value="accountant">Comptable</option>
                  <option value="staff">Staff</option>
                  <option value="viewer">Viewer</option>
                </>
              )}
            </select>
          </label>
        </div>

        {objective === "client_management" ? (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
            {(
              [
                ["Clients", "can_manage_customers"],
                ["Créer factures", "can_create_invoices"],
                ["Valider", "can_validate_invoices"],
                ["TTN", "can_submit_ttn"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs flex items-center justify-between">
                <span className="text-slate-700">{label}</span>
                <input
                  type="checkbox"
                  checked={(perms as any)[key]}
                  onChange={(e) => setPerms((p) => ({ ...p, [key]: e.target.checked }))}
                  disabled={!isManager || pending}
                />
              </label>
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          <Btn
            disabled={!isManager || pending}
            onClick={() => startTransition(async () => createInvite())}
          >
            {pending ? "Envoi…" : "Créer invitation"}
          </Btn>
        </div>
      </Card>

      <Card title="Invitations en attente" subtitle="Status = pending">
        {rows.length === 0 ? (
          <div className="text-sm text-slate-600">Aucune invitation en attente.</div>
        ) : (
          <Table
            head={
              <tr>
                <th>Email</th>
                <th>Objectif</th>
                <th>Rôle</th>
                <th>Créée</th>
                <th>Expire</th>
                <th className="text-right">Action</th>
              </tr>
            }
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-medium">{r.invited_email}</td>
                <td><Badge>{String(r.objective || "—")}</Badge></td>
                <td><Badge>{String(r.role || "—")}</Badge></td>
                <td>{fmtDate(r.created_at)}</td>
                <td>{fmtDate(r.expires_at)}</td>
                <td className="text-right">
                  {isManager ? (
                    <Btn
                      variant="ghost" asChild={false}
                      disabled={pending}
                      onClick={() => startTransition(async () => cancelInvite(r.id))}
                    >
                      Annuler
                    </Btn>
                  ) : (
                    <span className="text-xs opacity-70">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="text-xs text-slate-500">
        Après acceptation, le membre apparaîtra dans <b>Rôles & accès</b>.
      </div>
    </div>
  );
}
