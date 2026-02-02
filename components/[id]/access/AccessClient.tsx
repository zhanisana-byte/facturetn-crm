"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Card, Input, Select } from "@/components/ui";

type Props = {
  companyId: string;
  canInvite: boolean;
};

type InviteRow = {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  expires_at: string;
  token: string;
  can_manage_customers: boolean;
  can_create_invoices: boolean;
  can_validate_invoices: boolean;
  can_submit_ttn: boolean;
  created_at: string;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  can_manage_customers: boolean;
  can_create_invoices: boolean;
  can_validate_invoices: boolean;
  can_submit_ttn: boolean;
  is_active: boolean;
  app_users?: { email?: string | null; full_name?: string | null } | null;
};

function randomToken(len = 32) {
  
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
    .slice(0, len * 2);
}

export default function AccessClient({ companyId, canInvite }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [pManageCustomers, setPManageCustomers] = useState(false);
  const [pCreateInvoices, setPCreateInvoices] = useState(true);
  const [pValidateInvoices, setPValidateInvoices] = useState(false);
  const [pSubmitTTN, setPSubmitTTN] = useState(false);

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  async function loadAll() {
    setErr(null);
    setLoading(true);
    try {
      
      const { data: inv, error: invErr } = await supabase
        .from("access_invitations")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (invErr) throw invErr;
      setInvites((inv as any) ?? []);

      const { data: mem, error: memErr } = await supabase
        .from("memberships")
        .select(
          "id,user_id,role,can_manage_customers,can_create_invoices,can_validate_invoices,can_submit_ttn,is_active,app_users(email,full_name)"
        )
        .eq("company_id", companyId)
        .order("role", { ascending: true });

      if (memErr) throw memErr;
      setMembers((mem as any) ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Erreur chargement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    
  }, [companyId]);

  async function createInvite() {
    setErr(null);
    if (!canInvite) return;

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErr("Email invalide.");
      return;
    }

    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Non connecté.");

      const token = randomToken(32);

      const { error } = await supabase.from("access_invitations").insert({
        company_id: companyId,
        invited_email: cleanEmail,
        invited_by_user_id: auth.user.id,
        role,
        can_manage_customers: pManageCustomers,
        can_create_invoices: pCreateInvoices,
        can_validate_invoices: pValidateInvoices,
        can_submit_ttn: pSubmitTTN,
        token,
      });

      if (error) throw error;

      setEmail("");
      await loadAll();
      alert("Invitation créée ");
    } catch (e: any) {
      setErr(e?.message ?? "Erreur création invitation.");
    } finally {
      setLoading(false);
    }
  }

  async function revokeInvite(inviteId: string) {
    setErr(null);
    if (!canInvite) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("access_invitations")
        .update({ status: "revoked" })
        .eq("id", inviteId);

      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Erreur revoke.");
    } finally {
      setLoading(false);
    }
  }

  async function updateMemberPerm(memberId: string, patch: Partial<MemberRow>) {
    setErr(null);
    if (!canInvite) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("memberships")
        .update({
          role: patch.role,
          can_manage_customers: patch.can_manage_customers,
          can_create_invoices: patch.can_create_invoices,
          can_validate_invoices: patch.can_validate_invoices,
          can_submit_ttn: patch.can_submit_ttn,
          is_active: patch.is_active,
        })
        .eq("id", memberId);

      if (error) throw error;
      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? "Erreur update member.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card title="Accès (Comptable gérée & Équipe)">
        <div className="text-sm text-slate-600">
          Ici, la société peut donner accès à un comptable gérée, ou ajouter son équipe gérée.
        </div>

        {err ? <div className="mt-3 text-sm text-red-600">{err}</div> : null}

        {canInvite ? (
          <div className="mt-4 grid gap-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">Email à inviter</div>
                <Input
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEmail(e.target.value)}
                  placeholder="ex: comptable@email.tn"
                />
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Rôle</div>
                <Select value={role} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setRole(e.target.value)}>
                  <option value="viewer">Viewer</option>
                  <option value="staff">Staff</option>
                  <option value="accountant">Accountant</option>
                  <option value="owner">Owner (attention)</option>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pManageCustomers}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPManageCustomers(e.target.checked)}
                />
                Gérer clients (customers)
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pCreateInvoices}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPCreateInvoices(e.target.checked)}
                />
                Créer factures
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pValidateInvoices}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPValidateInvoices(e.target.checked)}
                />
                Valider factures
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={pSubmitTTN}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPSubmitTTN(e.target.checked)}
                />
                Envoyer TTN (sensible)
              </label>
            </div>

            <div className="flex gap-2">
              <Btn onClick={createInvite} disabled={loading}>
                Créer invitation
              </Btn>
              <Btn onClick={loadAll} disabled={loading} className="bg-white text-slate-900 border border-slate-200 hover:bg-slate-50">
                Rafraîchir
              </Btn>
            </div>

            <div className="text-xs text-slate-500">
              Le lien d’acceptation sera:{" "}
              <span className="font-mono">
                {baseUrl}/access/accept/{"{TOKEN}"}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-slate-600">
            vous as accès en lecture. Seul <b>owner</b> peut inviter ou modifier permissions.
          </div>
        )}
      </Card>

      <Card title="Invitations (en attente)">
        {invites.length === 0 ? (
          <div className="text-sm text-slate-600">Aucune invitation.</div>
        ) : (
          <div className="grid gap-3">
            {invites.map((i) => {
              const acceptUrl = `${baseUrl}/access/accept/${i.token}`;
              return (
                <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm">
                      <b>{i.invited_email}</b> — rôle: <b>{i.role}</b> — statut:{" "}
                      <b>{i.status}</b>
                    </div>
                    {canInvite ? (
                      <Btn
                        onClick={() => revokeInvite(i.id)}
                        disabled={loading || i.status !== "pending"}
                        className="bg-rose-600 hover:bg-rose-700"
                      >
                        Révoquer
                      </Btn>
                    ) : null}
                  </div>

                  <div className="mt-2 text-xs text-slate-600">
                    Expires: {new Date(i.expires_at).toLocaleString()}
                  </div>

                  <div className="mt-2 text-xs">
                    Lien:{" "}
                    <span className="font-mono break-all">{acceptUrl}</span>{" "}
                    <button
                      className="ml-2 underline text-slate-700"
                      onClick={() => navigator.clipboard.writeText(acceptUrl)}
                    >
                      Copier
                    </button>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    Perms: customers({String(i.can_manage_customers)}), create({String(i.can_create_invoices)}),
                    validate({String(i.can_validate_invoices)}), ttn({String(i.can_submit_ttn)})
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Membres (équipe + comptables)">
        {members.length === 0 ? (
          <div className="text-sm text-slate-600">Aucun membre.</div>
        ) : (
          <div className="grid gap-3">
            {members.map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <b>{m.app_users?.full_name ?? "—"}</b>{" "}
                    <span className="text-slate-600">({m.app_users?.email ?? m.user_id})</span>
                    {" "}— rôle: <b>{m.role}</b>
                    {" "}— actif: <b>{m.is_active ? "oui" : "non"}</b>
                  </div>
                </div>

                <div className="mt-3 grid md:grid-cols-2 gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.can_manage_customers}
                      disabled={!canInvite}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateMemberPerm(m.id, { ...m, can_manage_customers: e.target.checked })
                      }
                    />
                    Gérer clients
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.can_create_invoices}
                      disabled={!canInvite}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateMemberPerm(m.id, { ...m, can_create_invoices: e.target.checked })
                      }
                    />
                    Créer factures
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.can_validate_invoices}
                      disabled={!canInvite}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateMemberPerm(m.id, { ...m, can_validate_invoices: e.target.checked })
                      }
                    />
                    Valider factures
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={m.can_submit_ttn}
                      disabled={!canInvite}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateMemberPerm(m.id, { ...m, can_submit_ttn: e.target.checked })
                      }
                    />
                    Envoyer TTN
                  </label>
                </div>

                {canInvite ? (
                  <div className="mt-3 flex gap-2">
                    <Select
                      value={m.role}
                      onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => updateMemberPerm(m.id, { ...m, role: e.target.value })}
                    >
                      <option value="viewer">viewer</option>
                      <option value="staff">staff</option>
                      <option value="accountant">accountant</option>
                      <option value="owner">owner</option>
                    </Select>

                    <Btn
                      className="bg-white text-slate-900 border border-slate-200 hover:bg-slate-50"
                      onClick={() => updateMemberPerm(m.id, { ...m, is_active: !m.is_active })}
                      disabled={loading}
                    >
                      {m.is_active ? "Désactiver" : "Activer"}
                    </Btn>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
