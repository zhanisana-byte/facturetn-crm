"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export default function DigiGoRedirectUI() {
  const router = useRouter();
  const sp = useSearchParams();

  const token = useMemo(() => s(sp.get("token") || ""), [sp]);
  const code = useMemo(() => s(sp.get("code") || ""), [sp]);
  const state = useMemo(() => s(sp.get("state") || ""), [sp]);
  const invoice_id = useMemo(() => s(sp.get("invoice_id") || ""), [sp]);
  const back_url = useMemo(() => s(sp.get("back_url") || sp.get("back") || ""), [sp]);

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const r = await fetch("/api/digigo/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code, state, invoice_id, back_url }),
          cache: "no-store",
          credentials: "include",
        });

        const j = await r.json().catch(() => null);

        if (cancelled) return;

        if (!r.ok) {
          setStatus("error");
          setMessage(String(j?.error || j?.message || `Erreur ${r.status}`));
          return;
        }

        setStatus("ok");
        setMessage("Connexion DigiGo validée. Signature finalisée.");

        const go = s(j?.back_url) || back_url || "/app";
        router.replace(go);
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setMessage(String(e?.message || "Erreur inattendue."));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, code, state, invoice_id, back_url, router]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 640, width: "100%", padding: 20, borderRadius: 16, border: "1px solid rgba(148,163,184,.35)", background: "rgba(255,255,255,.85)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Connexion DigiGo</div>
        {status === "loading" && <div style={{ fontSize: 14, opacity: 0.85 }}>Finalisation en cours...</div>}
        {status === "ok" && <div style={{ fontSize: 14, opacity: 0.9 }}>{message}</div>}
        {status === "error" && (
          <div style={{ fontSize: 14, color: "#b91c1c" }}>
            Erreur
            <div style={{ marginTop: 6, opacity: 0.9 }}>{message}</div>
          </div>
        )}
      </div>
    </div>
  );
}
