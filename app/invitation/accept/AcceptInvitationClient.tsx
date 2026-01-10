"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "loading" | "ok" | "error";

export default function AcceptInvitationClient({ token }: { token: string }) {
  const router = useRouter();
  const safeToken = useMemo(() => (token || "").trim(), [token]);

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string>(
    safeToken ? "Invitation détectée. Voulez-vous accepter l’accès ?" : ""
  );

  async function call(path: string) {
    if (!safeToken) {
      setStatus("error");
      setMessage("Lien d’invitation invalide (token manquant).");
      return;
    }

    setStatus("loading");
    setMessage("Traitement en cours…");

    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: safeToken }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Action impossible.");

      setStatus("ok");
      setMessage(json?.message || "Action effectuée. Redirection…");
      setTimeout(() => router.push("/dashboard"), 900);
    } catch (e: any) {
      setStatus("error");
      setMessage(e?.message || "Erreur inconnue.");
    }
  }

  // Token absent
  if (!safeToken) {
    return (
      <div className="ftn-page">
        <div className="ftn-card">
          <h1 className="ftn-h1">Invitation</h1>
          <p className="ftn-muted">Lien invalide (token manquant).</p>
          <div className="mt-4">
            <button className="ftn-btn" onClick={() => router.push("/dashboard")}>
              Retour au dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const disabled = status === "loading" || status === "ok";

  return (
    <div className="ftn-page">
      <div className="ftn-card">
        <h1 className="ftn-h1">Accès cabinet / société</h1>

        <p className="ftn-muted">
          {status === "idle" && "Invitation détectée. Voulez-vous accepter l’accès ?"}
          {status !== "idle" && message}
        </p>

        <div className="mt-4 flex gap-2 flex-wrap">
          <button
            className="ftn-btn"
            disabled={disabled}
            onClick={() => call("/api/access-invitations/accept")}
          >
            {status === "loading" ? "..." : "Accepter"}
          </button>

          <button
            className="ftn-btn-ghost"
            disabled={disabled}
            onClick={() => call("/api/access-invitations/decline-by-token")}
          >
            {status === "loading" ? "..." : "Refuser"}
          </button>

          <button
            className="ftn-btn-ghost"
            disabled={status === "loading"}
            onClick={() => router.push("/dashboard")}
          >
            Retour
          </button>
        </div>

        {status === "error" ? (
          <div className="mt-3 ftn-alert">
            Si vous n’êtes pas connecté avec l’email invité, connectez-vous puis réessayez.
          </div>
        ) : null}
      </div>
    </div>
  );
}
