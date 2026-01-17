"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import GroupInvitationActions from "./GroupInvitationActions";
import CreateGroupInvitationForm from "./CreateGroupInvitationForm";

type Row = any;

export default function GroupInvitationsClient({
  groupId,
  currentUserEmail,
  isManager,
}: {
  groupId: string;
  currentUserEmail: string;
  isManager: boolean;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<Row[]>([]);
  const [received, setReceived] = useState<Row[]>([]);

  async function load() {
    setLoading(true);
    const myEmail = String(currentUserEmail || "").toLowerCase();

    // received
    const { data: recRaw } = await supabase
      .from("group_invitations")
      .select("*")
      .eq("group_id", groupId)
      .eq("invited_email", myEmail)
      .order("created_at", { ascending: false });

    // sent (only if manager)
    const { data: sentRaw } = isManager
      ? await supabase
          .from("group_invitations")
          .select("*")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
      : ({ data: [] as any[] } as any);

    const rec = (recRaw ?? []) as Row[];
    const snt = (sentRaw ?? []) as Row[];

    // keep only "sent by me" in sent list (UX)
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth?.user?.id;
    const mySent = uid ? snt.filter((r: any) => r.invited_by_user_id === uid) : [];

    setReceived(rec);
    setSent(mySent);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const hasAny = useMemo(() => (received?.length ?? 0) + (sent?.length ?? 0) > 0, [received, sent]);

  if (loading) return <div className="ftn-muted">Chargement…</div>;

  return (
    <div className="ftn-grid" style={{ gap: 16 }}>
      {isManager ? <CreateGroupInvitationForm groupId={groupId} onCreated={load} /> : null}

      {!hasAny ? (
        <div className="ftn-card">
          <div className="ftn-muted">Aucune invitation pour le moment.</div>
        </div>
      ) : (
        <>
          <div className="ftn-card">
            <div className="ftn-card-title">Invitations reçues</div>
            {received.length === 0 ? (
              <div className="ftn-muted">Aucune invitation reçue.</div>
            ) : (
              <div className="space-y-3">
                {received.map((r: any) => (
                  <div key={r.id} className="border rounded-2xl p-3" style={{ borderColor: "rgba(148,163,184,.24)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">{r.invited_email}</div>
                        <div className="text-xs opacity-70">Rôle: {r.role} • Statut: {r.status}</div>
                        {r.objective ? <div className="text-xs opacity-80 mt-1">Objet: {r.objective}</div> : null}
                      </div>
                      <GroupInvitationActions kind="received" token={r.token} status={r.status} onDone={load} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isManager ? (
            <div className="ftn-card">
              <div className="ftn-card-title">Invitations envoyées</div>
              {sent.length === 0 ? (
                <div className="ftn-muted">Aucune invitation envoyée.</div>
              ) : (
                <div className="space-y-3">
                  {sent.map((r: any) => (
                    <div key={r.id} className="border rounded-2xl p-3" style={{ borderColor: "rgba(148,163,184,.24)" }}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-semibold">{r.invited_email}</div>
                          <div className="text-xs opacity-70">Rôle: {r.role} • Statut: {r.status}</div>
                          {r.objective ? <div className="text-xs opacity-80 mt-1">Objet: {r.objective}</div> : null}
                        </div>
                        <GroupInvitationActions kind="sent" token={r.token} status={r.status} onDone={load} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
