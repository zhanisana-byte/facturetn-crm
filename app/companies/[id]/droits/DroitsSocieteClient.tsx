"use client";

import { useMemo, useState, ChangeEvent } from "react";
type Member = {
  id: string;
  user_id: string;
  role: "owner" | "accountant" | "staff" | "viewer" | string;
  is_active: boolean;
  can_manage_customers: boolean;
  can_create_invoices: boolean;
  can_validate_invoices: boolean;
  can_submit_ttn: boolean;
  app_users?: { full_name?: string | null; email?: string | null } | null;
};

function roleLabel(m: Member) {
  if (m.role === "owner") return "Owner";
  if (m.role === "accountant") return "Comptable";
  if (m.role === "staff") return "Admin"; 
  return "Viewer";
}

function boolBadge(v: boolean) {
  return v ? "Oui" : "Non";
}

export default function DroitsSocieteClient({
  companyId,
  companyName,
  isOwner,
  members,
}: {
  companyId: string;
  companyName: string;
  isOwner: boolean;
  members: Member[];
}) {
  const [rows, setRows] = useState<Member[]>(members ?? []);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canEdit = isOwner;

  const activeRows = useMemo(() => rows ?? [], [rows]);

  async function save(m: Member) {
    setErr(null);
    setSavingId(m.id);
    try {
      const res = await fetch("/api/memberships/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membership_id: m.id,
          company_id: companyId,
          role: m.role,
          is_active: m.is_active,
          can_manage_customers: !!m.can_manage_customers,
          can_create_invoices: !!m.can_create_invoices,
          can_validate_invoices: !!m.can_validate_invoices,
          can_submit_ttn: !!m.can_submit_ttn,
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

  async function revoke(m: Member) {
    if (!confirm("Désactiver l’accès de ce membre ?")) return;
    setErr(null);
    setSavingId(m.id);
    try {
      const res = await fetch("/api/memberships/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membership_id: m.id, company_id: companyId }),
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

  function setMember(id: string, patch: Partial<Member>) {
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function promoteAdmin(id: string, v: boolean) {
    if (!v) return;

    setMember(id, { role: "staff" } as any);
  }

  function isDelegationOnly(m: Member) {
    const hasOps =
      !!m.can_manage_customers || !!m.can_create_invoices || !!m.can_validate_invoices || !!m.can_submit_ttn;
    
    return String(m.role || "") === "viewer" && hasOps;
  }

  function opsCount(m: Member) {
    return [m.can_manage_customers, m.can_create_invoices, m.can_validate_invoices, m.can_submit_ttn].filter(Boolean)
      .length;
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Droits — Société</h1>
        <p className="text-sm text-slate-600">
          Société: <span className="font-medium text-slate-900">{companyName}</span>
        </p>
        {!canEdit ? (
          <div className="text-xs text-slate-500">Lecture seule (seul le Owner peut modifier).</div>
        ) : (
          <div className="text-xs text-slate-500">
            Owner : vous pouvez modifier le rôle, les permissions et révoquer l’accès.
          </div>
        )}
      </div>

      {err ? <div className="ftn-alert">{err}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="text-sm font-semibold">Équipe & accès</div>
          <div className="text-xs text-slate-500">
            1 carte = 1 profil. En haut: <span className="font-semibold">Rôle (gestion)</span>. En bas: <span className="font-semibold">Permissions (facture / TTN)</span>.
          </div>
        </div>

        {activeRows.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">Aucun membre.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeRows.map((m) => {
              const disabled = !!savingId && savingId !== m.id;
              const isSaving = savingId === m.id;

              const delegationOnly = isDelegationOnly(m);
              const badge = delegationOnly ? "Délégation" : roleLabel(m);

              return (
                <div key={m.id} className="p-4">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">
                        {m.app_users?.full_name || "—"}
                      </div>
                      <div className="truncate text-xs text-slate-500">{m.app_users?.email || m.user_id}</div>
                      <div className="mt-1 text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                        <span>
                          Statut: <span className="font-semibold">{m.is_active ? "ACTIF" : "INACTIF"}</span>
                        </span>
                        {opsCount(m) > 0 ? (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {opsCount(m)} permission(s)
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        {badge}
                      </span>

                      {canEdit ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {["owner", "staff", "admin"].includes(String(m.role || "")) ? (
                            <label className="text-xs text-slate-600">
                              Rôle de page:
                              <select
                                className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                                disabled={disabled || isSaving || delegationOnly}
                                value={String(m.role) === "admin" ? "staff" : m.role}
                                onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setMember(m.id, { role: e.target.value as any })}
                              >
                                <option value="owner">Owner</option>
                                <option value="staff">Admin</option>
                              </select>
                            </label>
                          ) : (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">Accès société (sans rôle page)</span>
                          )}

                          {String(m.role || "") !== "staff" && String(m.role || "") !== "admin" ? (
                            <button
                              className="ftn-btn ftn-btn-ghost"
                              disabled={disabled || isSaving}
                              onClick={() => setMember(m.id, { role: "staff" } as any)}
                              type="button"
                              title="Donner le rôle Admin (page) — l'accès opérations reste géré par permissions"
                            >
                              Donner rôle Admin
                            </button>
                          ) : null}

                          {String(m.role || "") === "staff" || String(m.role || "") === "admin" ? (
                            <button
                              className="ftn-btn ftn-btn-ghost"
                              disabled={disabled || isSaving}
                              onClick={() => setMember(m.id, { role: "viewer" } as any)}
                              type="button"
                              title="Retirer le rôle de page (la personne garde les permissions opérations)"
                            >
                              Retirer rôle page
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-600">Mode:</span>
                    <select
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                      disabled={disabled || isSaving}
                      value={
                        (m.can_manage_customers && m.can_create_invoices && m.can_validate_invoices && m.can_submit_ttn)
                          ? "all"
                          : "custom"
                      }
                      onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
                        const v = e.target.value;
                        if (v === "all") {
                          setMember(m.id, {
                            can_manage_customers: true,
                            can_create_invoices: true,
                            can_validate_invoices: true,
                            can_submit_ttn: true,
                          } as any);
                        }
                      }}
                    >
                      <option value="all">Accès total</option>
                      <option value="custom">Par tâches</option>
                    </select>

                    <span className="text-slate-500">{opsCount(m)} permission(s)</span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    {[
                      ["Clients", "can_manage_customers"] as const,
                      ["Créer factures", "can_create_invoices"] as const,
                      ["Valider", "can_validate_invoices"] as const,
                      ["TTN", "can_submit_ttn"] as const,
                    ].map(([label, key]) => (
                      <div
                        key={key}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between"
                      >
                        <span className="text-slate-700">{label}</span>
                        {canEdit ? (
                          <input
                            type="checkbox"
                            disabled={disabled || isSaving}
                            checked={!!(m as any)[key]}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setMember(m.id, { [key]: e.target.checked } as any)}
                          />
                        ) : (
                          <span className="font-semibold text-slate-700">{boolBadge(!!(m as any)[key])}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  {canEdit ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="ftn-btn" disabled={disabled || isSaving} onClick={() => save(m)} type="button">
                        {isSaving ? "Sauvegarde..." : "Sauvegarder"}
                      </button>
                      <button
                        className="ftn-btn ftn-btn-ghost"
                        disabled={disabled || isSaving || !m.is_active}
                        onClick={() => revoke(m)}
                        type="button"
                      >
                        Révoquer accès
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500">
        Note: Les invitations se gèrent dans <span className="font-semibold">/invitations</span>. Une fois acceptée, la personne apparaît ici.
      </div>
    </div>
  );
}
