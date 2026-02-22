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
          setError("MISSING_TOKEN");
          return;
        }

        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(s(data?.error || data?.message || "CALLBACK_FAILED"));
          return;
        }

        if (!cancelled) {
          setDone(true);
          const back = s(data?.back_url) || "/invoices";
          setTimeout(() => {
            window.location.href = back;
          }, 600);
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
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#0b0f19",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: 14,
          padding: 22,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          color: "#fff",
          textAlign: "center",
        }}
      >
        {!done && !error && (
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: "3px solid rgba(255,255,255,0.25)",
                borderTopColor: "#fff",
                margin: "0 auto",
                animation: "digigoSpin 0.8s linear infinite",
              }}
            />
            <div style={{ fontSize: 14, opacity: 0.9 }}>Connexion DigiGo…</div>
          </div>
        )}
        {done && !error && <div style={{ fontSize: 18, fontWeight: 700 }}>OK</div>}
        {error && <div style={{ color: "#ff6b6b", fontSize: 14, fontWeight: 600 }}>{error}</div>}

        <style jsx global>{`
          @keyframes digigoSpin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
