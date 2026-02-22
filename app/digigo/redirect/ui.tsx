"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function RedirectUi() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = s(params.get("token"));

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");

        if (!token) {
          setError("TOKEN_MANQUANT");
          return;
        }

        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "CALLBACK_FAILED");

        if (!cancelled) {
          setDone(true);
          const back = s(data?.back_url) || "/invoices";
          window.location.href = back;
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "ERREUR");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ padding: 24 }}>
      {!done && !error && <p>Connexion DigiGo…</p>}
      {done && <p>OK</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
