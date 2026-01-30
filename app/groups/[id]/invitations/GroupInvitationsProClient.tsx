"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CompanyRow = {
  id: string;
  company_name: string | null;
  tax_id: string | null;
  link_type: "internal" | "external";
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  permissions: any;
  app_users?: { full_name?: string | null; email?: string | null } | null;
};

type InvitationRow = {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  created_at: string;
  token: string;
  objective: string | null;
};

type ManageMode = "page" | "clients" | "page_clients";

type CompanyPerms = {
  can_manage_customers?: boolean;
  can_create_invoices?: boolean;
  can_validate_invoices?: boolean;
  can_submit_ttn?: boolean;
};

function safeJson(v: string | null) {
  try {
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function pill(txt: string, tone: "ok" | "warn" | "neutral" = "neutral") {
  const cls =
    tone === "ok"
      ? "ftn-pill ftn-pill-ok"
      : tone === "warn"
        ? "ftn-pill ftn-pill-warn"
        : "ftn-pill";
  return <span className={cls}>{txt}</span>;
}

function permsLabel(p: CompanyPerms) {
  const a: string[] = [];
  if (p.can_manage_customers) a.push("Clients");
  if (p.can_create_invoices) a.push("Factures");
  if (p.can_validate_invoices) a.push("Validation");
  if (p.can_submit_ttn) a.push("Envoi");
  return a.length ? a.join(" • ") : "Lecture";
}

export default function GroupInvitationsProClient({
  groupId,
  canInvite,
}: {
  groupId: string;
  canInvite: boolean;
}) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);

  // data
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InvitationRow[]>([]);

  // form
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<ManageMode>("page_clients");
  const [pageRole, setPageRole] = useState<"admin" | "owner">("admin");

  const [scopeAll, setScopeAll] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [permByCompany, setPermByCompany] = useState<Record<string, CompanyPerms>>({});
  const [note, setNote] = useState("");

  // table controls
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "internal" | "external">("all");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  async function loadAll() {
    setLoading(true);

    const [cRes, mRes, iRes] = await Promise.all([
      supabase
        .from("group_companies")
        .select("company_id, link_type, companies(id, company_name, tax_id)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false }),
      supabase
        .from("group_members")
        .select("id,user_id,role,is_active,permissions, app_users:app_users(full_name,email)")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true }),
      supabase
        .from("group_invitations")
        .select("id, invited_email, role, status, created_at, token, objective")
        .eq("group_id", groupId)
        .order("created_at", { ascending: false }),
    ]);

    const cc =
      (cRes.data ?? []).map((x: any) => ({
        id: String(x?.companies?.id ?? x?.company_id),
        company_name: x?.companies?.company_name ?? null,
        tax_id: x?.companies?.tax_id ?? null,
        link_type: (x?.link_type ?? "internal") as "internal" | "external",
      })) ?? [];

    setCompanies(cc);
    setMembers((mRes.data ?? []) as any);
    setInvites((iRes.data ?? []) as any);

    setPermByCompany((prev) => {
      const next = { ...prev };
      for (const c of cc) {
        if (!next[c.id]) {
          next[c.id] = {
            can_manage_customers: true,
            can_create_invoices: true,
            can_validate_invoices: false,
            can_submit_ttn: false,
          };
        }
      }
      return next;
    });

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const showClients = mode === "clients" || mode === "page_clients";

  const filteredCompanies = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return companies.filter((c) => {
      if (typeFilter !== "all" && c.link_type !== typeFilter) return false;
      if (!qq) return true;
      return (
        String(c.company_name ?? "").toLowerCase().includes(qq) ||
        String(c.tax_id ?? "").toLowerCase().includes(qq)
      );
    });
  }, [companies, q, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCompanies.length / pageSize));
  const pageRows = filteredCompanies.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [q, typeFilter]);

  function toggleCompany(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function setCompanyPerm(id: string, patch: Partial<CompanyPerms>) {
    setPermByCompany((p) => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }));
  }

  function selectedIds() {
    return Object.keys(selected).filter((k) => selected[k]);
  }

  function whoManages(companyId: string) {
    const list = members
      .filter((m) => m.is_active)
      .map((m) => {
        const perms = (m.permissions ?? {}) as any;
        const map = (perms.company_permissions ?? {}) as Record<string, CompanyPerms>;
        const p = map?.[companyId] ?? null;
        if (!p) return null;

        const name = m.app_users?.full_name || m.app_users?.email || m.user_id;
        return { name, role: String(m.role || ""), label: permsLabel(p) };
      })
      .filter(Boolean) as { name: string; role: string; label: string }[];

    return list;
  }

  async function submitInvite() {
    if (!canInvite) return;

    const invited_email = email.trim().toLowerCase();
    if (!invited_email || !invited_email.includes("@")) {
      alert("Veuillez saisir un email valide.");
      return;
    }

    // rôle page UNIQUEMENT owner/admin
    const role = mode === "page" || mode === "page_clients" ? pageRole : null;

    // choix clients
    const useAll = showClients && scopeAll;
    const ids = showClients ? (useAll ? companies.map((c) => c.id) : selectedIds()) : [];

    if (showClients && !useAll && ids.length === 0) {
      alert("Veuillez sélectionner au moins une société (ou activer : Toutes les sociétés).");
      return;
    }

    const company_permissions: Record<string, CompanyPerms> = {};
    if (showClients) {
      for (const id of ids) company_permissions[id] = permByCompany[id] ?? {};
    }

    const objective = {
      mode,
      note: note.trim() || null,
      manage_all: useAll,
      company_ids: ids,
      company_permissions,
    };

    const res = await fetch("/api/group-invitations/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group_id: groupId,
        invited_email,
        role, // owner/admin ou null
        objective: JSON.stringify(objective),
      }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error || "Une erreur est survenue.");
      return;
    }

    setEmail("");
    setNote("");
    setSelected({});
    await loadAll();
    alert("Invitation envoyée ✅");
  }

  const pending = invites.filter((x) => x.status === "pending");
  const accepted = invites.filter((x) => x.status === "accepted");

  return (
    <div className="space-y-4">
      <div className="ftn-card p-4">
        <div className="text-sm font-semibold">Nouvelle invitation</div>
        <div className="text-xs text-slate-500 mt-1">
          Veuillez choisir : gestion de la page, gestion des clients, ou les deux.
        </div>

        {!canInvite ? (
          <div className="mt-3 text-sm opacity-70">Seul le Owner peut envoyer des invitations.</div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">Email du profil</div>
                <input
                  className="ftn-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@domaine.com"
                />
              </div>

              <div>
                <div className="text-xs text-slate-500 mb-1">Type de gestion</div>
                <select className="ftn-input" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                  <option value="page">Gestion de la page</option>
                  <option value="clients">Gestion des clients</option>
                  <option value="page_clients">Gestion page + clients</option>
                </select>
              </div>
            </div>

            {mode === "page" || mode === "page_clients" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Rôle (page)</div>
                  <select className="ftn-input" value={pageRole} onChange={(e) => setPageRole(e.target.value as any)}>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Note (optionnelle)</div>
                  <input
                    className="ftn-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex : suivi factures + envoi"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs text-slate-500 mb-1">Note (optionnelle)</div>
                <input
                  className="ftn-input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex : gestion des clients"
                />
              </div>
            )}

            {showClients ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Sélection des sociétés</div>
                  <label className="text-xs text-slate-600 flex items-center gap-2">
                    <input type="checkbox" checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} />
                    Toutes les sociétés
                  </label>
                </div>

                {!scopeAll ? (
                  <>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <input
                        className="ftn-input"
                        placeholder="Rechercher (nom / MF)"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                      />
                      <select className="ftn-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
                        <option value="all">Tous types</option>
                        <option value="internal">Interne</option>
                        <option value="external">Externe</option>
                      </select>
                      <div className="text-xs text-slate-500 flex items-center">{filteredCompanies.length} société(s)</div>
                    </div>

                    <div className="mt-3 overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-slate-500 border-b">
                            <th className="py-2 px-2">Activer</th>
                            <th className="py-2 px-2">Société</th>
                            <th className="py-2 px-2">MF</th>
                            <th className="py-2 px-2">Type</th>
                            <th className="py-2 px-2">Déjà gérée par</th>
                            <th className="py-2 px-2">Permissions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((c) => {
                            const managers = whoManages(c.id);
                            const p = permByCompany[c.id] ?? {};
                            return (
                              <tr key={c.id} className="border-b last:border-0">
                                <td className="py-2 px-2">
                                  <input type="checkbox" checked={!!selected[c.id]} onChange={() => toggleCompany(c.id)} />
                                </td>
                                <td className="py-2 px-2 font-semibold">{c.company_name ?? "Société"}</td>
                                <td className="py-2 px-2 text-slate-600">{c.tax_id ?? "—"}</td>
                                <td className="py-2 px-2">
                                  {c.link_type === "internal" ? pill("Interne") : pill("Externe", "warn")}
                                </td>
                                <td className="py-2 px-2 text-xs text-slate-600">
                                  {managers.length ? (
                                    <div className="space-y-1">
                                      {managers.slice(0, 2).map((m, idx) => (
                                        <div key={idx}>
                                          <b>{m.name}</b> ({m.role}) — {m.label}
                                        </div>
                                      ))}
                                      {managers.length > 2 ? <div>+{managers.length - 2} autres</div> : null}
                                    </div>
                                  ) : (
                                    <span className="opacity-60">—</span>
                                  )}
                                </td>
                                <td className="py-2 px-2">
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={!!p.can_manage_customers}
                                        onChange={(e) => setCompanyPerm(c.id, { can_manage_customers: e.target.checked })}
                                      />
                                      Clients
                                    </label>
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={!!p.can_create_invoices}
                                        onChange={(e) => setCompanyPerm(c.id, { can_create_invoices: e.target.checked })}
                                      />
                                      Factures
                                    </label>
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={!!p.can_validate_invoices}
                                        onChange={(e) => setCompanyPerm(c.id, { can_validate_invoices: e.target.checked })}
                                      />
                                      Validation
                                    </label>
                                    <label className="flex items-center gap-2">
                                      <input
                                        type="checkbox"
                                        checked={!!p.can_submit_ttn}
                                        onChange={(e) => setCompanyPerm(c.id, { can_submit_ttn: e.target.checked })}
                                      />
                                      Envoi
                                    </label>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="text-xs text-slate-500">
                        Page {page} / {totalPages}
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="ftn-btn ftn-btn-ghost"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          type="button"
                        >
                          Précédent
                        </button>
                        <button
                          className="ftn-btn ftn-btn-ghost"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          type="button"
                        >
                          Suivant
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-xs text-slate-600">Toutes les sociétés seront incluses (interne + externe).</div>
                )}
              </div>
            ) : null}

            <div className="flex items-center justify-end">
              <button className="ftn-btn" onClick={submitInvite} type="button">
                Envoyer l’invitation
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">En attente ({pending.length})</div>
        {loading ? (
          <div className="text-sm opacity-70">Chargement…</div>
        ) : pending.length === 0 ? (
          <div className="text-sm opacity-70">Aucune invitation.</div>
        ) : (
          <div className="grid gap-2">
            {pending.map((r) => {
              const obj = safeJson(r.objective);
              const mm = String(obj?.mode || "—");
              const count = Array.isArray(obj?.company_ids) ? obj.company_ids.length : 0;
              return (
                <div key={r.id} className="rounded-2xl border p-3" style={{ borderColor: "rgba(148,163,184,.24)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{r.invited_email}</div>
                      <div className="text-xs opacity-70">
                        Type : <b>{mm}</b> • Rôle page : <b>{r.role}</b> • Sociétés : <b>{count}</b>
                      </div>
                      <div className="text-xs opacity-70">{new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-xs opacity-60">En attente</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Acceptées ({accepted.length})</div>
        {loading ? (
          <div className="text-sm opacity-70">Chargement…</div>
        ) : accepted.length === 0 ? (
          <div className="text-sm opacity-70">Aucune.</div>
        ) : (
          <div className="grid gap-2">
            {accepted.map((r) => (
              <div key={r.id} className="rounded-2xl border p-3" style={{ borderColor: "rgba(148,163,184,.24)" }}>
                <div className="font-semibold">{r.invited_email}</div>
                <div className="text-xs opacity-70">Rôle page : {r.role}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
