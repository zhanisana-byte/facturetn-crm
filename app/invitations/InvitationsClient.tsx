"use client";

import { useState } from "react";

export default function InvitationsClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(path: string) {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Action impossible.");
      setMsg("OK ✅");
      window.location.reload();
    } catch (e: any) {
      setMsg(e?.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        className="ftn-btn-ghost"
        disabled={loading}
        onClick={() => act("/api/access-invitations/accept")}
      >
        {loading ? "..." : "Accepter"}
      </button>
      <button
        className="ftn-btn-ghost"
        disabled={loading}
        onClick={() => act("/api/access-invitations/decline-by-token")}
      >
        {loading ? "..." : "Refuser"}
      </button>
      {msg ? <span className="text-xs ftn-muted">{msg}</span> : null}
    </div>
  );
}
