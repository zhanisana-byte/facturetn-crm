"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CreateGroupInvitationForm from "./CreateGroupInvitationForm";

type Inv = {
  id: string;
  invited_email: string;
  role: string;
  status: string;
  created_at: string;
  token: string;
  objective: string | null;
};

function parseObjective(obj: string | null) {
  try {
    if (!obj) return null;
    const j = JSON.parse(obj);
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

export default function GroupInvitationsClient({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  const supabase = createClient();
  const [rows, setRows] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("group_invitations")
      .select("id, invited_email, role, status, created_at, token, objective")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });

    if (!error) setRows((data ?? []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
    
  }, [groupId]);

  const [received, setReceived] = useState<Inv[]>([]);
  useEffect(() => {
    (async () => {
      const { data: me } = await supabase.auth.getUser();
      const email = String(me?.data?.user?.email || "").toLowerCase();
      if (!email) return;

      const { data } = await supabase
        .from("group_invitations")
        .select("id, invited_email, role, status, created_at, token, objective")
        .eq("invited_email", email)
        .order("created_at", { ascending: false });

      setReceived((data ?? []) as any);
    })();
  }, [supabase]);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const accepted = useMemo(() => rows.filter((r) => r.status === "accepted"), [rows]);

  async function accept(token: string) {
    const res = await fetch("/api/group-invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error || "Erreur acceptation");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Inviter votre équipe</div>
        {isOwner ? (
          <CreateGroupInvitationForm groupId={groupId} onCreated={load} />
        ) : (
          <div className="text-sm opacity-80">
            Seul le <b>Owner</b> du groupe peut inviter des membres.
          </div>
        )}
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Invitations en attente ({pending.length})</div>
        {loading ? (
          <div className="text-sm opacity-70">Chargement…</div>
        ) : pending.length === 0 ? (
          <div className="text-sm opacity-70">Aucune invitation en attente.</div>
        ) : (
          <div className="grid gap-2">
            {pending.map((r) => {
              const obj = parseObjective(r.objective);
              const scope = String(obj?.manage_companies_scope || "none");
              const ids = Array.isArray(obj?.manage_company_ids) ? obj.manage_company_ids : [];
              return (
                <div key={r.id} className="rounded-2xl border p-3" style={{ borderColor: "rgba(148,163,184,.24)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{r.invited_email}</div>
                      <div className="text-xs opacity-70">
                        Rôle: {r.role} • Scope sociétés: <b>{scope}</b>
                        {scope === "selected" ? ` (${ids.length})` : ""}
                      </div>
                      <div className="text-xs opacity-70">Créée: {new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-xs opacity-70">Token OK</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Invitations acceptées ({accepted.length})</div>
        {loading ? (
          <div className="text-sm opacity-70">Chargement…</div>
        ) : accepted.length === 0 ? (
          <div className="text-sm opacity-70">Aucune invitation acceptée.</div>
        ) : (
          <div className="grid gap-2">
            {accepted.map((r) => (
              <div key={r.id} className="rounded-2xl border p-3" style={{ borderColor: "rgba(148,163,184,.24)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{r.invited_email}</div>
                    <div className="text-xs opacity-70">Rôle: {r.role}</div>
                    <div className="text-xs opacity-70">Créée: {new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-xs opacity-70"> Acceptée</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {}
      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Invitations reçues ({received.length})</div>
        {received.length === 0 ? (
          <div className="text-sm opacity-70">Aucune invitation reçue.</div>
        ) : (
          <div className="grid gap-2">
            {received.map((r) => (
              <div key={r.id} className="rounded-2xl border p-3" style={{ borderColor: "rgba(148,163,184,.24)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">Groupe #{groupId.slice(0, 8)}…</div>
                    <div className="text-xs opacity-70">Rôle proposé: {r.role}</div>
                    <div className="text-xs opacity-70">Statut: {r.status}</div>
                  </div>
                  <div className="flex gap-2">
                    {r.status === "pending" ? (
                      <button className="ftn-btn" onClick={() => accept(r.token)}>
                        Accepter
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
