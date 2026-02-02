"use client";

import { useState } from "react";

type Kind = "sent" | "received";

export default function GroupInvitationActions({
  kind,
  token,
  status,
  onDone,
}: {
  kind: Kind;
  token: string;
  status: string;
  onDone?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const isPending = status === "pending";

  async function action(url: string) {
    setLoading(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.error || "Erreur.");
      }
    } finally {
      setLoading(false);
      onDone?.();
    }
  }

  if (!isPending) return <span className="text-xs text-gray-400">—</span>;

  return (
    <div className="flex items-center gap-2">
      {kind === "received" ? (
        <>
          <button className="ftn-btn" disabled={loading} onClick={() => action("/api/group-invitations/accept")}>
            Accepter
          </button>
          <button className="ftn-btn-ghost" disabled={loading} onClick={() => action("/api/group-invitations/decline")}>
            Refuser
          </button>
        </>
      ) : (
        <button className="ftn-btn-ghost" disabled={loading} onClick={() => action("/api/group-invitations/cancel")}>
          Annuler
        </button>
      )}
    </div>
  );
}
