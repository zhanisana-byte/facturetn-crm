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
  const [loading, setLoading] = useState<"" | "accept" | "decline" | "cancel">("");
  const [err, setErr] = useState<string>("");

  const pending = String(status || "").toLowerCase() === "pending";

  async function call(path: string, action: typeof loading) {
    setErr("");
    setLoading(action);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Action impossible.");

      router.refresh();
    } catch (e: any) {
      setErr(e?.message || "Erreur.");
    } finally {
      setLoading("");
    }
  }

  if (!pending) return <span className="text-xs text-slate-500">—</span>;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {kind === "received" ? (
        <>
          <button
            className="ftn-btn"
            disabled={!!loading}
            onClick={() => call("/api/access-invitations/accept", "accept")}
            title="Accepter l’accès"
          >
            {loading === "accept" ? "..." : "Accepter"}
          </button>

          <button
            className="ftn-btn-ghost"
            disabled={!!loading}
            onClick={() => call("/api/access-invitations/decline", "decline")}
            title="Refuser l’accès"
          >
            {loading === "decline" ? "..." : "Refuser"}
          </button>
        </>
      ) : (
        <button
          className="ftn-btn-ghost"
          disabled={!!loading}
          onClick={() => call("/api/access-invitations/cancel", "cancel")}
          title="Annuler l’invitation envoyée"
        >
          {loading === "cancel" ? "..." : "Annuler"}
        </button>
      )}

      {err ? <span className="text-xs text-red-600">{err}</span> : null}
    </div>
  );
}
