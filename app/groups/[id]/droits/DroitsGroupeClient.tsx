"use client";

import { useMemo, useState } from "react";
import { DROITS_PAR_ROLE, type PageRole } from "@/app/lib/droits";

type MemberRow = {
  id: string;
  user_id: string;
  role: string | null;
  permissions: any;
  is_active: boolean | null;
  created_at: string | null;
  app_users?: { full_name?: string | null; email?: string | null } | null;
};

function mapGroupRoleToPageRole(role: string | null | undefined): PageRole {
  const r = String(role || "").toLowerCase();
  if (r === "owner") return "owner";
  if (r === "admin") return "admin";
  if (r === "staff") return "member";
  return "viewer";
}

function badgeClass(role: string) {
  const r = role.toLowerCase();
  if (r === "owner") return "bg-amber-100 text-amber-800 border-amber-200";
  if (r === "admin") return "bg-sky-100 text-sky-800 border-sky-200";
  if (r === "member") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

const PERM_KEYS = [
  { key: "manage_members", label: "Gérer les membres" },
  { key: "invite_members", label: "Inviter" },
  { key: "manage_companies", label: "Gérer sociétés" },
  { key: "create_invoices", label: "Créer factures" },
  { key: "view_ttn", label: "Voir TTN" },
] as const;

export default function DroitsGroupeClient({
  groupId,
  groupName,
  isOwner,
  myRole,
  canManage,
  members,
}: {
  groupId: string;
  groupName: string;
  isOwner: boolean;
  myRole: string | null;
  canManage: boolean;
  members: MemberRow[];
}) {
  const [rows, setRows] = useState<MemberRow[]>(members ?? []);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const computed = useMemo(() => {
    return (rows ?? []).map((m) => {
      const pageRole = mapGroupRoleToPageRole(m.role);

      // ✅ FIX: Groupe = ActiveMode "multi_societe"
      const droits = DROITS_PAR_ROLE.multi_societe[pageRole] ?? ["read_only"];

      const perms = m.permissions && typeof m.permissions === "object" ? m.permissions : {};
      return { ...m, pageRole, droits, perms };
    });
  }, [rows]);

  function setMember(id: string, patch: Partial<MemberRow>) {
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function setPerm(id: string, key: string, value: boolean) {
    setRows((prev) =>
      prev.map((x) => {
        if (x.id !== id) return x;
        const p = x.permissions && typeof x.permissions === "object" ? { ...x.permissions } : {};
        p[key] = value;
        return { ...x, permissions: p };
      })
    );
  }

  async function save(m: any) {
    setErr(null);
    setSavingId(m.id);
    try {
      const res = await fetch("/api/group-members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_member_id: m.id,
          group_id: groupId,
          role: m.role,
          is_active: !!m.is_active,
          permissions: m.permissions ?? {},
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Erreur update");
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setSavingId(null);
    }
  }

  async function revoke(m: any) {
    if (!confirm("Désactiver l’accès de ce membre ?")) return;
    setErr(null);
    setSavingId(m.id);
    try {
      const res = await fetch("/api/group-members/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_member_id: m.id, group_id: groupId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Erreur revoke");
      setRows((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_active: false } : x)));
    } catch (e: any) {
      setErr(e?.message || "Erreur");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Rôles & Permissions — Groupe</h1>
        <p className="text-sm text-slate-600">
          Groupe: <span className="font-medium text-slate-900">{groupName}</span>
        </p>
        <div className="text-xs text-slate-500">
          Votre rôle: <span className="font-semibold">{isOwner ? "Owner" : myRole ?? "—"}</span> •{" "}
          {canManage ? "Vous pouvez gérer les membres." : "Lecture seule."}
        </div>
      </div>

      {err ? <div className="ftn-alert">{err}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="text-sm font-semibold">Membres</div>
          <div className="text-xs text-slate-500">Owner / Admin / Staff + permissions (json)</div>
        </div>

        {computed.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">Aucun membre.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {computed.map((m: any) => {
              const disabled = !!savingId && savingId !== m.id;
              const isSaving = savingId === m.id;
              const roleUi = m.pageRole;

              return (
                <div key={m.id} className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {m.app_users?.full_name || "—"}
                      </div>
                      <div className="truncate text-xs text-slate-500">{m.app_users?.email || m.user_id}</div>
                      <div className="mt-1 text-xs text-slate-600">
                        Statut: <span className="font-semibold">{m.is_active ? "ACTIF" : "INACTIF"}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(roleUi)}`}>
                        {roleUi.toUpperCase()}
                      </span>

                      {canManage && roleUi !== "owner" ? (
                        <label className="text-xs text-slate-600">
                          Role:
                          <select
                            className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                            disabled={disabled || isSaving}
                            value={String(m.role ?? "staff")}
                            onChange={(e) => setMember(m.id, { role: e.target.value })}
                          >
                            <option value="admin">admin</option>
                            <option value="staff">staff</option>
                          </select>
                        </label>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {PERM_KEYS.map((p) => (
                      <div
                        key={p.key}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between"
                      >
                        <span className="text-slate-700">{p.label}</span>
                        {canManage && roleUi !== "owner" ? (
                          <input
                            type="checkbox"
                            disabled={disabled || isSaving}
                            checked={!!m.perms?.[p.key]}
                            onChange={(e) => setPerm(m.id, p.key, e.target.checked)}
                          />
                        ) : (
                          <span className="font-semibold text-slate-700">{m.perms?.[p.key] ? "Oui" : "Non"}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {canManage && roleUi !== "owner" ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="ftn-btn" disabled={disabled || isSaving} onClick={() => save(m)}>
                        {isSaving ? "Sauvegarde..." : "Sauvegarder"}
                      </button>
                      <button
                        className="ftn-btn ftn-btn-ghost"
                        disabled={disabled || isSaving || !m.is_active}
                        onClick={() => revoke(m)}
                      >
                        Désactiver
                      </button>
                    </div>
                  ) : null}

                  <div className="mt-3 text-xs text-slate-500">
                    Droits “par défaut” (guide):{" "}
                    {m.droits.map((d: string) => (
                      <span
                        key={d}
                        className="ml-2 rounded-full border border-slate-200 bg-white px-2 py-0.5"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Les invitations groupe sont dans <span className="font-semibold">/groups/invitations</span>.
      </div>
    </div>
  );
}
