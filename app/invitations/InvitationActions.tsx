"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Kind = "sent" | "received";

export default function InvitationActions({
  kind,
  token,
  status,
}: {
  kind: Kind;
  token: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isPending = status === "pending";

  async function action(url: string) {
    setLoading(true);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    router.refresh();
    setLoading(false);
  }

  if (!isPending) return <span className="text-xs text-gray-400">—</span>;

  return (
    <div className="flex gap-2">
      {kind === "received" ? (
        <>
          <button
            className="ftn-btn"
            disabled={loading}
            onClick={() => action("/api/access-invitations/accept")}
          >
            Accepter
          </button>
          <button
            className="ftn-btn-ghost"
            disabled={loading}
            onClick={() => action("/api/access-invitations/decline")}
          >
            Refuser
          </button>
        </>
      ) : (
        <button
          className="ftn-btn-ghost"
          disabled={loading}
          onClick={() => action("/api/access-invitations/cancel")}
        >
          Annuler
        </button>
      )}
    </div>
  );
}
