"use client";

import { useMemo, useState, ChangeEvent, FormEvent } from "react";
import type { ReactNode } from "react";

type InvitationRow = {
  id: string;
  invited_email: string;
  role: string;
  objective: "page_management" | "client_management" | string;
  status: string;
  token?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  can_manage_customers?: boolean | null;
  can_create_invoices?: boolean | null;
  can_validate_invoices?: boolean | null;
  can_submit_ttn?: boolean | null;
};

type GroupInviteRow = {
  id: string;
  status: string;
  invited_email: string;
  created_at?: string | null;
  group_id: string;
  groups?: { group_name?: string | null; group_type?: string | null } | null;
};

type GroupOption = { id: string; group_name: string; group_type: string };

function BadgePill({ children, tone = "soft" }: { children: ReactNode; tone?: "soft" | "good" | "bad" }) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "bad"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-slate-50 text-slate-700 border-slate-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{children}</span>;
}

function Button({
  children,
  variant = "primary",
  disabled,
  onClick,
  type = "button",
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "soft";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const cls =
    variant === "primary"
      ? "bg-black text-white hover:opacity-90"
      : variant === "soft"
      ? "bg-white/60 border border-slate-200 hover:bg-white"
      : "bg-transparent border border-slate-200 hover:bg-slate-50";
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={`${base} ${cls}`}>
      {children}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}

function normalizeRoleLabel(role: string) {
  const r = String(role || "").toLowerCase();
  if (r === "owner") return "Owner";
  if (r === "staff" || r === "admin") return "Admin";
  if (r === "accountant" || r === "comptable") return "Comptable";
  return "Viewer";
}

function objectiveLabel(obj: string) {
  return obj === "page_management" ? "Gestion de la page" : "Gestion Société (opérations)";
}

export default function InvitationsSocieteClient({
  companyId,
  companyName,
  myRole,
  isOwner,
  isAdmin,
  initialRows,
  initialGroupInvites,
  myGroups,
}: {
  companyId: string;
  companyName: string;
  myRole: string;
  isOwner: boolean;
  isAdmin: boolean;
  initialRows: InvitationRow[];
  initialGroupInvites: GroupInviteRow[];
  myGroups: GroupOption[];
}) {
  const [rows, setRows] = useState<InvitationRow[]>(initialRows);
  const [pending, setPending] = useState(false);

  const [emailPage, setEmailPage] = useState("");
  const [rolePage, setRolePage] = useState<"owner" | "staff">("staff");

  const [emailOps, setEmailOps] = useState("");
  const [opsRole, setOpsRole] = useState<"accountant" | "viewer">("accountant");
  const [opsAll, setOpsAll] = useState(true);

const [groupInvites, setGroupInvites] = useState<GroupInviteRow[]>(initialGroupInvites);
const [gcKind, setGcKind] = useState<"group" | "cabinet">("group");
const [gcGroupId, setGcGroupId] = useState("");
const [gcEmail, setGcEmail] = useState("");
const [gcPending, setGcPending] = useState(false);
const [gcErr, setGcErr] = useState<string | null>(null);
  const [canCustomers, setCanCustomers] = useState(true);
  const [canCreate, setCanCreate] = useState(true);
  const [canValidate, setCanValidate] = useState(true);
  const [canSubmit, setCanSubmit] = useState(true);

  const [lastLink, setLastLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canInviteOps = isOwner || isAdmin; 
  const canInvitePage = isOwner; 

  const opsSummary = useMemo(() => {
    if (opsAll) return "Accès total (Clients + Factures + Validation + TTN)";
    const parts = [
      canCustomers ? "Clients" : null,
      canCreate ? "Créer factures" : null,
      canValidate ? "Valider" : null,
      canSubmit ? "TTN" : null,
    ].filter(Boolean);
    return parts.length ? parts.join(" • ") : "Aucune permission";
  }, [opsAll, canCustomers, canCreate, canValidate, canSubmit]);

  const copy = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      alert("Copié ");
    } catch {
      alert("Impossible de copier");
    }
  };

  async function createInvite(payload: any) {
    setErr(null);
    setLastLink(null);
    setPending(true);
    try {
      const res = await fetch("/api/access-invitations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Erreur création invitation");

      const inv: InvitationRow = j?.invitation;
      setRows((prev) => [inv, ...prev]);

      const link = String(j?.inviteLink || "");
      if (link) {
        setLastLink(link);
        await copy(link);
      }
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setPending(false);
    }
  }

  async function revoke(token?: string | null) {
    if (!token) return;
    if (!confirm("Révoquer cette invitation ?")) return;

    setErr(null);
    setPending(true);
    try {
      const res = await fetch("/api/access-invitations/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Erreur révocation");

      setRows((prev) => prev.map((r) => (r.token === token ? { ...r, status: "revoked" } : r)));
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setPending(false);
    }
  }

async function createGroupCompanyInvite() {
  setGcErr(null);
  setGcPending(true);
  try {
    const groupId = (gcGroupId || "").trim();
    const inviteEmail = (gcEmail || "").trim();
    if (!groupId) throw new Error("Group ID requis.");

    const res = await fetch("/api/group-company-invitations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        groupId,
        kind: gcKind,
        inviteEmail: inviteEmail || undefined,
      }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || "Erreur invitation Groupe/Cabinet");

    const inv: GroupInviteRow = j?.invitation;
    setGroupInvites((prev) => [inv, ...prev]);
    setGcEmail("");
    
  } catch (e: any) {
    setGcErr(e?.message || "Erreur");
  } finally {
    setGcPending(false);
  }
}

async function respondGroupInvite(invitationId: string, action: "accept" | "decline" | "revoke") {
  if (action === "revoke") {
    if (!confirm("Révoquer cette invitation Groupe/Cabinet ?")) return;
  }
  setGcErr(null);
  setGcPending(true);
  try {
    const res = await fetch(`/api/group-company-invitations/${invitationId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error || "Erreur");
    const status = String(j?.status || "");
    setGroupInvites((prev) =>
      prev.map((r) => (r.id === invitationId ? { ...r, status: status || r.status } : r))
    );
  } catch (e: any) {
    setGcErr(e?.message || "Erreur");
  } finally {
    setGcPending(false);
  }
}

  const pendingRows = rows.filter((r) => r.status === "pending");

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-5">
      <div className="rounded-3xl border border-white/30 bg-white/50 shadow-[0_12px_50px_rgba(0,0,0,0.08)] backdrop-blur p-5">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-slate-500">Espace Société</div>
          <div className="text-2xl font-semibold text-slate-900">{companyName}</div>
          <div className="text-xs text-slate-500">
            Rôle actuel: <span className="font-semibold">{normalizeRoleLabel(myRole)}</span>
          </div>
        </div>
      </div>

      {err ? <div className="ftn-alert tone-bad">{err}</div> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Inviter pour gérer la page</div>
                <div className="text-xs text-slate-500">
                  Rôle de page: <span className="font-semibold">Owner / Admin</span> (seul Owner peut le gérer).
                </div>
              </div>
              <BadgePill tone={canInvitePage ? "good" : "bad"}>{canInvitePage ? "Autorisé" : "Owner requis"}</BadgePill>
            </div>
          </div>

          <form
            className="p-4 space-y-3"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              if (!canInvitePage) return;
              const email = emailPage.trim().toLowerCase();
              if (!email) return setErr("Email requis");
              createInvite({
                company_id: companyId,
                invited_email: email,
                objective: "page_management",
                role: rolePage, 
              });
              setEmailPage("");
            }}
          >
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Email du profil</label>
              <input
                value={emailPage}
                onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEmailPage(e.target.value)}
                placeholder="ex: profile@email.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Rôle de page</label>
              <select
                value={rolePage}
                onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setRolePage(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                disabled={!canInvitePage}
              >
                <option value="staff">Admin</option>
                <option value="owner">Owner</option>
              </select>
              <div className="text-[11px] text-slate-500">
                Admin = peut gérer les opérations selon permissions. Owner = contrôle total (rôles + révocation).
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled>
                —
              </Button>
              <Button type="submit" disabled={!canInvitePage || pending}>
                Envoyer invitation
              </Button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Inviter pour gérer la société</div>
                <div className="text-xs text-slate-500">
                  Permissions: clients / factures / validation / TTN (sans gestion des rôles de page).
                </div>
              </div>
              <BadgePill tone={canInviteOps ? "good" : "bad"}>{canInviteOps ? "Autorisé" : "Admin/Owner requis"}</BadgePill>
            </div>
          </div>

          <form
            className="p-4 space-y-3"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              if (!canInviteOps) return;
              const email = emailOps.trim().toLowerCase();
              if (!email) return setErr("Email requis");

              const payload = {
                company_id: companyId,
                invited_email: email,
                objective: "client_management",
                role: opsRole, 
                can_manage_customers: opsAll ? true : canCustomers,
                can_create_invoices: opsAll ? true : canCreate,
                can_validate_invoices: opsAll ? true : canValidate,
                can_submit_ttn: opsAll ? true : canSubmit,
              };

              createInvite(payload);
              setEmailOps("");
            }}
          >
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Email (comptable / équipe)</label>
              <input
                value={emailOps}
                onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEmailOps(e.target.value)}
                placeholder="ex: comptable@email.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700">Type d’accès</label>
                <select
                  value={opsRole}
                  onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setOpsRole(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  disabled={!canInviteOps}
                >
                  <option value="accountant">Comptable</option>
                  <option value="viewer">Équipe (viewer)</option>
                </select>
                <div className="text-[11px] text-slate-500">
                  Comptable = accès opérationnel. Équipe = permissions ciblées.
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-700">Mode permissions</label>
                <select
                  value={opsAll ? "all" : "custom"}
                  onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setOpsAll(e.target.value === "all")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  disabled={!canInviteOps}
                >
                  <option value="all">Accès total</option>
                  <option value="custom">Par tâches</option>
                </select>
                <div className="text-[11px] text-slate-500">{opsSummary}</div>
              </div>
            </div>

            {!opsAll && (
              <div className="grid gap-2 md:grid-cols-2">
                <Switch checked={canCustomers} onChange={setCanCustomers} label="Gérer clients" />
                <Switch checked={canCreate} onChange={setCanCreate} label="Créer factures" />
                <Switch checked={canValidate} onChange={setCanValidate} label="Valider factures" />
                <Switch checked={canSubmit} onChange={setCanSubmit} label="Envoyer TTN" />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={!canInviteOps || pending}>
                Envoyer invitation
              </Button>
            </div>
          </form>
        </div>
      </div>

      {lastLink ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <div className="font-semibold">Lien d’invitation</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-slate-50 px-2 py-1 text-xs">{lastLink}</code>
            <Button variant="soft" onClick={() => copy(lastLink)}>
              Copier
            </Button>
          </div>
        </div>
      ) : null}

<div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
  <div className="p-4 border-b border-slate-100">
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold">Inviter Groupe / Cabinet</div>
        <div className="text-xs text-slate-500">
          Invitation pour lier un Groupe/Cabinet à cette société (le groupe pourra gérer cette société depuis son espace).
        </div>
      </div>
      <BadgePill tone={isOwner ? "good" : "bad"}>{isOwner ? "Owner" : "Owner requis"}</BadgePill>
    </div>
  </div>

  <div className="p-4 space-y-3">
    {gcErr ? <div className="ftn-alert tone-bad">{gcErr}</div> : null}

    <div className="grid gap-3 md:grid-cols-3">
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-700">Type</label>
        <select
          value={gcKind}
          onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setGcKind(e.target.value as any)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          disabled={!isOwner || gcPending}
        >
          <option value="group">Groupe</option>
          <option value="cabinet">Cabinet</option>
        </select>
        <div className="text-[11px] text-slate-500">Cabinet = groupe_type 'cabinet'.</div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-700">Sélection rapide</label>
        <select
          value={gcGroupId}
          onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setGcGroupId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          disabled={!isOwner || gcPending}
        >
          <option value="">— Choisir un groupe —</option>
          {myGroups?.map((g) => (
            <option key={g.id} value={g.id}>
              {g.group_name} ({g.group_type})
            </option>
          ))}
        </select>
        <div className="text-[11px] text-slate-500">Ou colle directement l'ID dans le champ ci-dessous.</div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-700">Group ID</label>
        <input
          value={gcGroupId}
          onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setGcGroupId(e.target.value)}
          placeholder="UUID du groupe/cabinet"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          disabled={!isOwner || gcPending}
        />
      </div>
    </div>

    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-700">Email Owner/Admin du groupe (optionnel)</label>
        <input
          value={gcEmail}
          onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setGcEmail(e.target.value)}
          placeholder="ex: cabinet@email.com"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          disabled={!isOwner || gcPending}
        />
        <div className="text-[11px] text-slate-500">
          Si vide : on envoie à l'email du Owner du groupe (si trouvé).
        </div>
      </div>

      <div className="flex items-end justify-end gap-2">
        <Button variant="ghost" disabled>
          —
        </Button>
        <Button
          disabled={!isOwner || gcPending}
          onClick={() => createGroupCompanyInvite()}
        >
          Envoyer invitation
        </Button>
      </div>
    </div>

    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 border-b border-slate-200">
        Invitations Groupe/Cabinet
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white">
            <tr className="text-left text-xs text-slate-500">
              <th className="px-3 py-2">Groupe</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groupInvites?.length ? (
              groupInvites.map((r) => {
                const gname = String((r as any)?.groups?.group_name || r.group_id);
                const gtype = String((r as any)?.groups?.group_type || "—");
                const st = String(r.status || "pending");
                const tone = st === "accepted" ? "good" : st === "declined" || st === "revoked" ? "bad" : "soft";
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{gname}</td>
                    <td className="px-3 py-2">{gtype}</td>
                    <td className="px-3 py-2">{r.invited_email}</td>
                    <td className="px-3 py-2">
                      <BadgePill tone={tone as any}>{st}</BadgePill>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        {isOwner && st === "pending" ? (
                          <Button variant="ghost" disabled={gcPending} onClick={() => respondGroupInvite(r.id, "revoke")}>
                            Révoquer
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  Aucune invitation groupe/cabinet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Invitations en attente</div>
            <div className="text-xs text-slate-500">Toutes les invitations non acceptées.</div>
          </div>
          <BadgePill>{pendingRows.length} pending</BadgePill>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Rôle</th>
                <th className="px-3 py-2">Permissions</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingRows.map((r) => {
                const token = typeof r.token === "string" ? r.token : null;
                const perms =
                  r.objective === "page_management"
                    ? "—"
                    : [
                        r.can_manage_customers ? "Clients" : null,
                        r.can_create_invoices ? "Créer" : null,
                        r.can_validate_invoices ? "Valider" : null,
                        r.can_submit_ttn ? "TTN" : null,
                      ]
                        .filter(Boolean)
                        .join(" • ") || "—";

                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{r.invited_email}</td>
                    <td className="px-3 py-2">
                      <BadgePill>{objectiveLabel(r.objective)}</BadgePill>
                    </td>
                    <td className="px-3 py-2">{normalizeRoleLabel(r.role)}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs text-slate-600">{perms}</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        {token ? (
                          <Button variant="soft" disabled={pending} onClick={() => copy(`${window.location.origin}/invitation/accept?token=${token}`)}>
                            Copier lien
                          </Button>
                        ) : null}
                        {token ? (
                          <Button variant="ghost" disabled={pending} onClick={() => revoke(token)}>
                            Révoquer
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {pendingRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-slate-500">
                    Aucune invitation en attente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 text-xs text-slate-500">
          Note: la personne accepte via <span className="font-semibold">/invitation/accept</span> puis elle apparaît dans “Équipe & permissions”.
        </div>
      </div>
    </div>
  );
}
