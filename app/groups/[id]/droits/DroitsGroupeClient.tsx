"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type MemberRow = {
  id: string;
  user_id: string;
  role: string | null;
  permissions: any;
  is_active: boolean | null;
  created_at: string | null;
  app_users?: { full_name?: string | null; email?: string | null } | null;
};

export type GroupCompany = {
  id: string;
  name: string;
  taxId: string;
  linkType: "managed";
};

const PAGE_PERMS = [
  { key: "manage_members", label: "Gérer l’équipe" },
  { key: "invite_members", label: "Inviter" },
  { key: "manage_companies", label: "Gérer les sociétés" },
] as const;

const COMPANY_PERMS = [
  { key: "create_invoices", label: "Créer des factures" },
  { key: "validate_invoices", label: "Valider" },
  { key: "submit_ttn", label: "Envoyer TTN" },
  { key: "manage_customers", label: "Gérer les clients" },
] as const;

function roleBadge(role: string | null | undefined) {
  const r = String(role ?? "").toLowerCase();
  if (r === "owner") return { t: "Owner", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  if (r === "admin") return { t: "Admin", cls: "bg-sky-100 text-sky-800 border-sky-200" };
  return { t: "Membre", cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

function safeObj(v: any) {
  return v && typeof v === "object" ? v : {};
}

export default function DroitsGroupeClient({
  groupId,
  groupName,
  isOwner,
  myRole,
  canManage,
  members,
  companies,
  createdCompanyId,
}: {
  groupId: string;
  groupName: string;
  isOwner: boolean;
  myRole: string | null;
  canManage: boolean;
  members: MemberRow[];
  companies: GroupCompany[];
  createdCompanyId: string | null;
}) {
  const [rows, setRows] = useState<MemberRow[]>(members ?? []);
  const [selectedId, setSelectedId] = useState<string>(() => rows?.[0]?.id ?? "");
  const [qMembers, setQMembers] = useState("");
  const [qCompanies, setQCompanies] = useState("");
  const [filterType, setFilterType] = useState<"all">("all");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(() => rows.find((m) => m.id === selectedId) ?? null, [rows, selectedId]);

  const membersFiltered = useMemo(() => {
    const qq = qMembers.trim().toLowerCase();
    return (rows ?? []).filter((m) => {
      if (!qq) return true;
      const n = String(m.app_users?.full_name ?? "").toLowerCase();
      const e = String(m.app_users?.email ?? "").toLowerCase();
      return n.includes(qq) || e.includes(qq);
    });
  }, [rows, qMembers]);

  const companiesFiltered = useMemo(() => {
    const qq = qCompanies.trim().toLowerCase();
    return (companies ?? []).filter((c) => {
      if (filterType !== "all" && c.linkType !== filterType) return false;
      if (!qq) return true;
      return String(c.name ?? "").toLowerCase().includes(qq) || String(c.taxId ?? "").toLowerCase().includes(qq);
    });
  }, [companies, qCompanies, filterType]);

  function getCompanyPerms(m: MemberRow, companyId: string) {
    const p = safeObj(m.permissions);
    const comps = safeObj(p.companies);
    return safeObj(comps[companyId]);
  }

  function memberManagedCounts(m: MemberRow) {
    const p = safeObj(m.permissions);
    const comps = safeObj(p.companies);

    let managed = 0;

    for (const c of companies ?? []) {
      const cp = safeObj(comps[c.id]);
      const hasAny = COMPANY_PERMS.some((k) => Boolean(cp[k.key]));
      if (!hasAny) continue;
      if (c.linkType === "managed") managed += 1;
      else managed += 1;
    }
    return { managed };
  }

  function patchMember(memberId: string, patch: Partial<MemberRow>) {
    setRows((prev) => prev.map((x) => (x.id === memberId ? { ...x, ...patch } : x)));
  }

  function setPagePerm(memberId: string, key: string, value: boolean) {
    setRows((prev) =>
      prev.map((x) => {
        if (x.id !== memberId) return x;
        const p = safeObj(x.permissions);
        return { ...x, permissions: { ...p, [key]: value } };
      })
    );
  }

  function setCompanyPerm(memberId: string, companyId: string, key: string, value: boolean) {
    setRows((prev) =>
      prev.map((x) => {
        if (x.id !== memberId) return x;
        const p = safeObj(x.permissions);
        const comps = safeObj(p.companies);
        const cur = safeObj(comps[companyId]);
        const nextCompany = { ...cur, [key]: value };
        const nextComps = { ...comps, [companyId]: nextCompany };
        return { ...x, permissions: { ...p, companies: nextComps } };
      })
    );
  }

  function revokeCompany(memberId: string, companyId: string) {
    setRows((prev) =>
      prev.map((x) => {
        if (x.id !== memberId) return x;
        const p = safeObj(x.permissions);
        const comps = safeObj(p.companies);
        const nextComps = { ...comps };
        delete nextComps[companyId];
        return { ...x, permissions: { ...p, companies: nextComps } };
      })
    );
  }

  async function saveMember(m: MemberRow) {
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
          is_active: m.is_active !== false,
          permissions: m.permissions ?? {},
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Une erreur est survenue.");
    } catch (e: any) {
      setErr(e?.message || "Une erreur est survenue.");
    } finally {
      setSavingId(null);
    }
  }

  async function revokeMember(m: MemberRow) {
    if (!confirm("Souhaitez-vous désactiver l’accès de ce membre ?")) return;
    setErr(null);
    setSavingId(m.id);
    try {
      const res = await fetch("/api/group-members/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_member_id: m.id, group_id: groupId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Une erreur est survenue.");

      patchMember(m.id, { is_active: false });
    } catch (e: any) {
      setErr(e?.message || "Une erreur est survenue.");
    } finally {
      setSavingId(null);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copié ");
    } catch {
      alert("Impossible de copier automatiquement. Veuillez copier manuellement.");
    }
  }

  return (
    <div className="space-y-6">
      {createdCompanyId ? (
        <div className="ftn-card-lux p-4 border border-emerald-200 bg-emerald-50">
          <div className="text-base font-semibold text-emerald-900">Création réussie </div>
          <div className="mt-1 text-sm text-emerald-900/80">
            La société gérée a été créée. Vous pouvez maintenant gérer votre équipe et les accès par société.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link className="ftn-btn-primary" href={`/companies/${createdCompanyId}`} prefetch={false}>
              Voir la société
            </Link>
            <Link className="ftn-btn-secondary" href={`/groups/${groupId}/ttn`} prefetch={false}>
              Paramètres TTN
            </Link>
            <Link className="ftn-btn-secondary" href={`/groups/${groupId}/clients`} prefetch={false}>
              Mes sociétés
            </Link>
          </div>
        </div>
      ) : null}

      <div className="ftn-card-lux p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Équipe & permissions</div>
            <div className="text-sm opacity-80">Groupe : {groupName}</div>
            <div className="mt-1 text-xs text-slate-500">
              {isOwner ? "Vous êtes Owner." : myRole === "admin" ? "Vous êtes Admin." : "Vous pouvez consulter."}
            </div>
          </div>

          <div className="min-w-[320px]">
            <div className="text-xs text-slate-500 mb-1">ID du groupe</div>
            <div className="flex gap-2">
              <input className="ftn-input flex-1" value={groupId} readOnly />
              <button type="button" className="ftn-btn" onClick={() => copy(groupId)}>
                Copier
              </button>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Communiquez cet ID à une société pour vous envoyer une invitation.
            </div>
          </div>
        </div>
      </div>

      {err ? (
        <div className="ftn-card p-3 border border-rose-200 bg-rose-50 text-rose-800 text-sm">{err}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
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
              const b = roleBadge(m.role);
              const isSelected = m.id === selectedId;
              const c = memberManagedCounts(m);

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={[
                    "w-full text-left rounded-xl border p-3 transition",
                    isSelected ? "border-slate-300 bg-white shadow-sm" : "border-slate-200 bg-white/70 hover:bg-white",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{m.app_users?.full_name ?? "Profil"}</div>
                      <div className="text-xs text-slate-500">{m.app_users?.email ?? ""}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border ${b.cls}`}>{b.t}</span>
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    Sociétés gérées : <span className="font-semibold">gérées {c.managed}</span> ·{" "}
                    <span className="font-semibold">gérées {c.managed}</span>
                  </div>

                  {m.is_active === false ? (
                    <div className="mt-2 text-xs text-rose-700">Accès désactivé</div>
                  ) : null}
                </button>
              );
            })}

            {membersFiltered.length === 0 ? (
              <div className="text-sm text-slate-500">Aucun membre.</div>
            ) : null}
          </div>
        </div>

        <div className="ftn-card p-4">
          {!selected ? (
            <div className="text-sm text-slate-500">Veuillez sélectionner un membre.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Détails</div>
                  <div className="text-xs text-slate-500">
                    {selected.app_users?.full_name ? `Membre : ${selected.app_users.full_name}` : "Membre"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="ftn-btn ftn-btn-ghost"
                    disabled={!canManage || savingId === selected.id}
                    onClick={() => saveMember(selected)}
                  >
                    {savingId === selected.id ? "Enregistrement…" : "Enregistrer"}
                  </button>

                  <button
                    type="button"
                    className="ftn-btn ftn-btn-ghost"
                    disabled={!canManage || savingId === selected.id || selected.is_active === false}
                    onClick={() => revokeMember(selected)}
                  >
                    Désactiver l’accès
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold">Accès à la page</div>
                <div className="mt-3 flex flex-wrap gap-4">
                  {PAGE_PERMS.map((p) => {
                    const checked = Boolean(safeObj(selected.permissions)[p.key]);
                    return (
                      <label key={p.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canManage || selected.is_active === false}
                          onChange={(e) => setPagePerm(selected.id, p.key, e.target.checked)}
                        />
                        {p.label}
                      </label>
                    );
                  })}
                </div>

                {!canManage ? (
                  <div className="mt-2 text-xs text-slate-500">
                    Vous pouvez consulter, mais seules les personnes Owner/Admin peuvent modifier.
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Accès par société</div>
                    <div className="text-xs text-slate-500">Choisissez les sociétés que ce membre peut gérer.</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <select
                      className="ftn-input"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value as any)}
                    >
                      <option value="all">Toutes</option>                    </select>

                    <input
                      className="ftn-input w-64"
                      placeholder="Rechercher (nom / MF)"
                      value={qCompanies}
                      onChange={(e) => setQCompanies(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mt-4 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 border-b">
                        <th className="py-2 px-2">Société</th>
                        <th className="py-2 px-2">MF</th>
                        <th className="py-2 px-2">Type</th>
                        <th className="py-2 px-2">Accès</th>
                        <th className="py-2 px-2 text-right">Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {companiesFiltered.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 px-2 text-slate-500">
                            Aucune société.
                          </td>
                        </tr>
                      ) : (
                        companiesFiltered.map((c) => {
                          const cp = getCompanyPerms(selected, c.id);
                          const hasAny = COMPANY_PERMS.some((k) => Boolean(cp[k.key]));

                          return (
                            <tr key={c.id} className="border-b last:border-0 align-top">
                              <td className="py-3 px-2">
                                <div className="font-semibold">{c.name}</div>
                              </td>
                              <td className="py-3 px-2 text-slate-600">{c.taxId}</td>
                              <td className="py-3 px-2">
                                <span className="text-xs text-slate-600">
                                  {c.linkType === "managed" ? "Gérée" : "Gérée"}
                                </span>
                              </td>
                              <td className="py-3 px-2">
                                <div className="flex flex-wrap gap-3">
                                  {COMPANY_PERMS.map((p) => {
                                    const checked = Boolean(cp[p.key]);
                                    return (
                                      <label key={p.key} className="flex items-center gap-2 text-xs">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={!canManage || selected.is_active === false}
                                          onChange={(e) =>
                                            setCompanyPerm(selected.id, c.id, p.key, e.target.checked)
                                          }
                                        />
                                        {p.label}
                                      </label>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="py-3 px-2 text-right">
                                {hasAny ? (
                                  <button
                                    type="button"
                                    className="ftn-btn ftn-btn-ghost"
                                    disabled={!canManage || selected.is_active === false}
                                    onClick={() => revokeCompany(selected.id, c.id)}
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

                {canManage ? (
                  <div className="mt-3 text-xs text-slate-500">
                    Après modification, cliquez sur <span className="font-semibold">Enregistrer</span>.
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
