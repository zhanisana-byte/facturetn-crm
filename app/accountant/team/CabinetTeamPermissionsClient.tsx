"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type MemberRow = {
  user_id: string;
  role: string | null;
  is_active: boolean | null;
  app_users?: { full_name?: string | null; email?: string | null } | null;
};

type CompanyRow = {
  id: string;
  company_name: string | null;
  tax_id: string | null;
};

type AssignmentRow = {
  group_id: string;
  user_id: string;
  company_id: string;

  can_view?: boolean | null;
  can_invoice?: boolean | null;
  can_submit_ttn?: boolean | null;
  can_manage_company?: boolean | null;
};

const PERMS: { key: keyof AssignmentRow; label: string }[] = [
  { key: "can_view", label: "Voir" },
  { key: "can_invoice", label: "Facturer" },
  { key: "can_submit_ttn", label: "Envoyer TTN" },
  { key: "can_manage_company", label: "Gérer le client" },
];

function roleLabel(role: string | null | undefined) {
  const r = String(role ?? "").toLowerCase();
  if (r === "owner") return { t: "Owner", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  if (r === "admin") return { t: "Admin", cls: "bg-sky-100 text-sky-800 border-sky-200" };
  return { t: "Membre", cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

export default function CabinetTeamPermissionsClient({
  cabinetId,
  cabinetName,
  myRole,
  members,
  companies,
  permissions,
}: {
  cabinetId: string;
  cabinetName: string;
  myRole: string;
  members: MemberRow[];
  companies: CompanyRow[];
  permissions: AssignmentRow[];
}) {
  const supabase = createClient();
  const canManage = myRole === "owner" || myRole === "admin";

  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    const first = (members ?? []).find((m) => m?.is_active !== false)?.user_id;
    return first ?? "";
  });
  const [qMembers, setQMembers] = useState("");
  const [qCompanies, setQCompanies] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const membersFiltered = useMemo(() => {
    const qq = qMembers.trim().toLowerCase();
    return (members ?? []).filter((m) => {
      if (!qq) return true;
      const name = String(m.app_users?.full_name ?? "").toLowerCase();
      const mail = String(m.app_users?.email ?? "").toLowerCase();
      return name.includes(qq) || mail.includes(qq);
    });
  }, [members, qMembers]);

  const companiesFiltered = useMemo(() => {
    const qq = qCompanies.trim().toLowerCase();
    return (companies ?? []).filter((c) => {
      if (!qq) return true;
      const n = String(c.company_name ?? "").toLowerCase();
      const mf = String(c.tax_id ?? "").toLowerCase();
      return n.includes(qq) || mf.includes(qq);
    });
  }, [companies, qCompanies]);

  const permsByUser = useMemo(() => {
    const map = new Map<string, AssignmentRow[]>();
    for (const p of permissions ?? []) {
      const arr = map.get(p.user_id) ?? [];
      arr.push(p);
      map.set(p.user_id, arr);
    }
    return map;
  }, [permissions]);

  const selectedMember = useMemo(() => {
    return (members ?? []).find((m) => m.user_id === selectedUserId) ?? null;
  }, [members, selectedUserId]);

  const selectedUserPerms = useMemo(() => {
    return permsByUser.get(selectedUserId) ?? [];
  }, [permsByUser, selectedUserId]);

  const managedCompanyIds = useMemo(() => {
    return new Set(selectedUserPerms.map((p) => p.company_id));
  }, [selectedUserPerms]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copié ");
    } catch {
      alert("Impossible de copier automatiquement. Veuillez copier manuellement.");
    }
  }

  async function setPerm(userId: string, companyId: string, key: keyof AssignmentRow, value: boolean) {
    if (!canManage) return;
    const k = `${userId}:${companyId}:${String(key)}`;
    setBusyKey(k);

    const payload: any = {
      group_id: cabinetId,
      user_id: userId,
      company_id: companyId,
      [key]: value,
    };

    const { error } = await supabase.from("accountant_company_assignments").upsert(payload, {
      onConflict: "group_id,user_id,company_id",
    });

    setBusyKey(null);

    if (error) {
      console.error(error);
      alert("Une erreur est survenue. Veuillez réessayer.");
      return;
    }

    window.location.reload();
  }

  async function revokeAccess(userId: string, companyId: string) {
    if (!canManage) return;
    const ok = confirm("Souhaitez-vous révoquer l’accès à ce client pour ce membre ?");
    if (!ok) return;

    const k = `revoke:${userId}:${companyId}`;
    setBusyKey(k);

    const { error } = await supabase
      .from("accountant_company_assignments")
      .delete()
      .eq("group_id", cabinetId)
      .eq("user_id", userId)
      .eq("company_id", companyId);

    setBusyKey(null);

    if (error) {
      console.error(error);
      alert("Impossible de révoquer l’accès. Veuillez réessayer.");
      return;
    }

    window.location.reload();
  }

  return (
    <div className="space-y-6">
      {}
      <div className="ftn-card-lux p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Équipe & permissions</div>
            <div className="text-sm opacity-80">Cabinet : {cabinetName}</div>
          </div>

          {}
          <div className="min-w-[320px]">
            <div className="text-xs text-slate-500 mb-1">ID du cabinet</div>
            <div className="flex gap-2">
              <input className="ftn-input flex-1" value={cabinetId} readOnly />
              <button type="button" className="ftn-btn" onClick={() => copy(cabinetId)}>
                Copier
              </button>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Communiquez cet ID à une société pour vous envoyer une invitation.
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {}
        <div className="ftn-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Votre équipe</div>
            <span className="text-xs text-slate-500">{membersFiltered.length} membre(s)</span>
          </div>

          <div className="mt-3">
            <input
              className="ftn-input w-full"
              placeholder="Rechercher (nom / email)"
              value={qMembers}
              onChange={(e) => setQMembers(e.target.value)}
            />
          </div>

          <div className="mt-4 space-y-2">
            {membersFiltered.map((m) => {
              const r = roleLabel(m.role);
              const isSelected = m.user_id === selectedUserId;

              const cnt = (permsByUser.get(m.user_id) ?? []).length;

              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => setSelectedUserId(m.user_id)}
                  className={[
                    "w-full text-left rounded-xl border p-3 transition",
                    isSelected ? "border-slate-300 bg-white shadow-sm" : "border-slate-200 bg-white/70 hover:bg-white",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">
                        {m.app_users?.full_name ?? "Profil"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {m.app_users?.email ?? ""}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${r.cls}`}>{r.t}</span>
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    Clients gérés : <span className="font-semibold">{cnt}</span>
                  </div>
                </button>
              );
            })}

            {membersFiltered.length === 0 && (
              <div className="text-sm text-slate-500">Aucun membre.</div>
            )}
          </div>
        </div>

        {}
        <div className="ftn-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Clients gérés</div>
              <div className="text-xs text-slate-500">
                {selectedMember?.app_users?.full_name
                  ? `Membre : ${selectedMember.app_users.full_name}`
                  : "Sélectionnez un membre"}
              </div>
            </div>

            <input
              className="ftn-input w-72"
              placeholder="Rechercher (client / MF)"
              value={qCompanies}
              onChange={(e) => setQCompanies(e.target.value)}
            />
          </div>

          <div className="mt-4 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b">
                  <th className="py-2 px-2">Client</th>
                  <th className="py-2 px-2">MF</th>
                  <th className="py-2 px-2">Accès</th>
                  <th className="py-2 px-2 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {!selectedUserId ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-2 text-slate-500">
                      Veuillez sélectionner un membre.
                    </td>
                  </tr>
                ) : companiesFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 px-2 text-slate-500">
                      Aucun client.
                    </td>
                  </tr>
                ) : (
                  companiesFiltered.map((c) => {
                    const has = managedCompanyIds.has(c.id);
                    const row = selectedUserPerms.find((p) => p.company_id === c.id) ?? ({} as AssignmentRow);

                    return (
                      <tr key={c.id} className="border-b last:border-0 align-top">
                        <td className="py-3 px-2">
                          <div className="font-semibold">{c.company_name ?? "Client"}</div>
                        </td>
                        <td className="py-3 px-2 text-slate-600">{c.tax_id ?? "—"}</td>
                        <td className="py-3 px-2">
                          {!has ? (
                            <span className="text-xs text-slate-500">Aucun accès</span>
                          ) : (
                            <div className="flex flex-wrap gap-3">
                              {PERMS.map((p) => {
                                const checked = Boolean((row as any)[p.key]);
                                const k = `${selectedUserId}:${c.id}:${String(p.key)}`;
                                return (
                                  <label key={String(p.key)} className="flex items-center gap-2 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={!canManage || busyKey === k}
                                      onChange={(e) => setPerm(selectedUserId, c.id, p.key, e.target.checked)}
                                    />
                                    {p.label}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right">
                          {has ? (
                            <button
                              type="button"
                              className="ftn-btn ftn-btn-ghost"
                              disabled={!canManage || busyKey === `revoke:${selectedUserId}:${c.id}`}
                              onClick={() => revokeAccess(selectedUserId, c.id)}
                            >
                              Révoquer
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!canManage && (
            <div className="mt-3 text-xs text-slate-500">
              Vous pouvez consulter, mais seules les personnes Owner/Admin peuvent modifier les accès.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
