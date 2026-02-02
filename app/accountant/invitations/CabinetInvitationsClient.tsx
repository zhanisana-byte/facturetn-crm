"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CreateCabinetInvitationForm from "./CreateCabinetInvitationForm";
import type { ReactNode } from "react";

type Inv = {
  id: string;
  group_id: string;
  invited_email: string;
  role: string;
  status: string;
  created_at: string;
  token: string;
  objective: string | null;
  groups?: { group_name?: string | null; group_type?: string | null } | null;
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

function Card({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children: ReactNode;
  tone?: "neutral" | "warning" | "success";
}) {
  const border =
    tone === "warning"
      ? "rgba(251,191,36,.55)"
      : tone === "success"
        ? "rgba(52,211,153,.45)"
        : "rgba(148,163,184,.24)";

  return (
    <div className="rounded-2xl border p-3" style={{ borderColor: border }}>
      <div className="font-semibold mb-1">{title}</div>
      {children}
    </div>
  );
}

export default function CabinetInvitationsClient({ cabinetGroupId }: { cabinetGroupId: string }) {
  const supabase = createClient();
  const sp = useSearchParams();
  const tokenFromUrl = sp.get("token")?.trim() || "";

  const [rows, setRows] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);

  const [received, setReceived] = useState<Inv[]>([]);
  const [myEmail, setMyEmail] = useState<string>("");

  const [tokenInv, setTokenInv] = useState<Inv | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);

  async function loadSentForThisCabinet() {
    setLoading(true);
    const { data, error } = await supabase
      .from("group_invitations")
      .select("id, group_id, invited_email, role, status, created_at, token, objective")
      .eq("group_id", cabinetGroupId)
      .order("created_at", { ascending: false });

    if (!error) setRows((data ?? []) as any);
    setLoading(false);
  }

  async function loadMyEmailAndReceived() {
    const { data: me } = await supabase.auth.getUser();
    const email = String(me?.user?.email || "").toLowerCase();
    setMyEmail(email);

    if (!email) {
      setReceived([]);
      return;
    }

    const { data } = await supabase
      .from("group_invitations")
      .select("id, group_id, invited_email, role, status, created_at, token, objective, groups(group_name,group_type)")
      .eq("invited_email", email)
      .order("created_at", { ascending: false });

    const onlyCabinet = (data ?? []).filter((r: any) => String(r?.groups?.group_type || "") === "cabinet");
    setReceived(onlyCabinet as any);
  }

  async function loadTokenInvitation(token: string) {
    if (!token) {
      setTokenInv(null);
      return;
    }
    setTokenLoading(true);

    const { data, error } = await supabase
      .from("group_invitations")
      .select("id, group_id, invited_email, role, status, created_at, token, objective, groups(group_name,group_type)")
      .eq("token", token)
      .maybeSingle();

    if (!error && data) setTokenInv(data as any);
    else setTokenInv(null);

    setTokenLoading(false);
  }

  useEffect(() => {
    loadSentForThisCabinet();
    loadMyEmailAndReceived();
    
  }, [cabinetGroupId]);

  useEffect(() => {
    
    loadTokenInvitation(tokenFromUrl);
    
  }, [tokenFromUrl]);

  const pendingSent = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const acceptedSent = useMemo(() => rows.filter((r) => r.status === "accepted"), [rows]);

  async function accept(token: string) {
    const res = await fetch("/api/cabinet-invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error || "Erreur acceptation");
      return;
    }
    await loadSentForThisCabinet();
    await loadMyEmailAndReceived();
    await loadTokenInvitation(tokenFromUrl);
  }

  async function reject(token: string) {
    const res = await fetch("/api/cabinet-invitations/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error || "Erreur refus");
      return;
    }
    await loadSentForThisCabinet();
    await loadMyEmailAndReceived();
    await loadTokenInvitation(tokenFromUrl);
  }

  async function cancel(invitationId: string) {
    const res = await fetch("/api/cabinet-invitations/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitation_id: invitationId }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(j?.error || "Erreur annulation");
      return;
    }
    await loadSentForThisCabinet();
  }

  function renderScope(objective: string | null) {
    const obj = parseObjective(objective);
    const scope = String(obj?.manage_companies_scope || "none");
    const ids = Array.isArray(obj?.manage_company_ids) ? obj.manage_company_ids : [];
    return (
      <span className="text-xs opacity-70">
        Scope sociétés: <b>{scope}</b>
        {scope === "selected" ? ` (${ids.length})` : ""}
      </span>
    );
  }

  const showTokenBox =
    !!tokenFromUrl &&
    (tokenLoading || tokenInv !== null);

  return (
    <div className="space-y-4">
      {showTokenBox ? (
        <div className="ftn-card p-4">
          <div className="font-semibold mb-2">Invitation (via lien email)</div>

          {tokenLoading ? (
            <div className="text-sm opacity-70">Chargement…</div>
          ) : !tokenInv ? (
            <Card title="Invitation introuvable" tone="warning">
              <div className="text-sm opacity-80">
                Le lien n’est pas valide ou l’invitation a été supprimée.
              </div>
            </Card>
          ) : (
            <Card
              title={`${tokenInv?.groups?.group_name || "Cabinet"} — Rôle: ${tokenInv.role}`}
              tone={tokenInv.status === "pending" ? "warning" : tokenInv.status === "accepted" ? "success" : "neutral"}
            >
              <div className="text-xs opacity-70">
                Pour: <b>{tokenInv.invited_email}</b> • Statut: <b>{tokenInv.status}</b>
              </div>
              <div className="mt-1">{renderScope(tokenInv.objective)}</div>

              {myEmail && myEmail !== String(tokenInv.invited_email || "").toLowerCase() ? (
                <div className="mt-2 text-sm text-amber-900">
                  ️ Ce lien est destiné à <b>{tokenInv.invited_email}</b> (vous êtes connecté en tant que <b>{myEmail}</b>).
                </div>
              ) : null}

              {tokenInv.status === "pending" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="ftn-btn" onClick={() => accept(tokenInv.token)}>
                    Accepter
                  </button>
                  <button className="ftn-btn ftn-btn-ghost" onClick={() => reject(tokenInv.token)}>
                    Refuser
                  </button>
                </div>
              ) : null}
            </Card>
          )}
        </div>
      ) : null}

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Inviter un profil</div>
        <div className="text-xs opacity-70 mb-3">
          L’invitation donne un rôle <b>cabinet</b> (owner/admin) + une permission de gestion des <b>sociétés liées</b> (all/selected).
          Elle ne touche pas au rôle “page” des sociétés clientes.
        </div>
        <CreateCabinetInvitationForm cabinetGroupId={cabinetGroupId} onCreated={loadSentForThisCabinet} />
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Invitations envoyées — en attente ({pendingSent.length})</div>
        {loading ? (
          <div className="text-sm opacity-70">Chargement…</div>
        ) : pendingSent.length === 0 ? (
          <div className="text-sm opacity-70">Aucune invitation en attente.</div>
        ) : (
          <div className="grid gap-2">
            {pendingSent.map((r) => (
              <Card key={r.id} title={r.invited_email} tone="warning">
                <div className="text-xs opacity-70">
                  Rôle: <b>{r.role}</b> • Créée: {new Date(r.created_at).toLocaleString()}
                </div>
                <div className="mt-1">{renderScope(r.objective)}</div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="ftn-btn ftn-btn-ghost" onClick={() => cancel(r.id)}>
                    Annuler l’invitation
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Invitations envoyées — acceptées ({acceptedSent.length})</div>
        {loading ? (
          <div className="text-sm opacity-70">Chargement…</div>
        ) : acceptedSent.length === 0 ? (
          <div className="text-sm opacity-70">Aucune invitation acceptée.</div>
        ) : (
          <div className="grid gap-2">
            {acceptedSent.map((r) => (
              <Card key={r.id} title={r.invited_email} tone="success">
                <div className="text-xs opacity-70">
                  Rôle: <b>{r.role}</b> • Créée: {new Date(r.created_at).toLocaleString()}
                </div>
                <div className="mt-1">{renderScope(r.objective)}</div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="ftn-card p-4">
        <div className="font-semibold mb-2">Invitations reçues ({received.length})</div>

        {!myEmail ? (
          <div className="text-sm opacity-70">Connectez-vous pour voir vos invitations.</div>
        ) : received.length === 0 ? (
          <div className="text-sm opacity-70">Aucune invitation reçue.</div>
        ) : (
          <div className="grid gap-2">
            {received.map((r) => (
              <Card
                key={r.id}
                title={`${r?.groups?.group_name || "Cabinet"} — Rôle: ${r.role}`}
                tone={r.status === "pending" ? "warning" : r.status === "accepted" ? "success" : "neutral"}
              >
                <div className="text-xs opacity-70">
                  Pour: <b>{r.invited_email}</b> • Statut: <b>{r.status}</b> • Reçue: {new Date(r.created_at).toLocaleString()}
                </div>
                <div className="mt-1">{renderScope(r.objective)}</div>

                {r.status === "pending" ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="ftn-btn" onClick={() => accept(r.token)}>
                      Accepter
                    </button>
                    <button className="ftn-btn ftn-btn-ghost" onClick={() => reject(r.token)}>
                      Refuser
                    </button>
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
