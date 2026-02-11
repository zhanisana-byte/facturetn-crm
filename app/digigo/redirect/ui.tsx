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
  const back_url = useMemo(() => s(sp.get("back") || ""), [sp]);

  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!code && !token) {
        setStatus("error");
        setMessage("Paramètres manquants.");
        return;
      }

      setStatus("loading");
      setMessage("");

      try {
        const r = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code, state, invoice_id, back_url }),
          cache: "no-store",
          credentials: "include",
        });

        const j = await r.json().catch(() => null);

        if (!r.ok) {
          const m = (j && (j.error || j.message)) || `Erreur ${r.status}`;
          if (!cancelled) {
            setStatus("error");
            setMessage(String(m));
          }
          return;
        }

        if (!cancelled) {
          setStatus("ok");
          setMessage("Signature finalisée.");
        }

        const go = s(j?.back_url) || back_url;
        if (go) router.replace(go);
        else router.replace("/app");
      } catch (e: any) {
        if (!cancelled) {
          setStatus("error");
          setMessage(e?.message ? String(e.message) : "Erreur inattendue.");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, code, state, invoice_id, back_url, router]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 560, width: "100%", padding: 20, borderRadius: 16, border: "1px solid rgba(148,163,184,.35)", background: "rgba(255,255,255,.75)" }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Finalisation de la signature</div>
        {status === "loading" && <div style={{ fontSize: 14, opacity: 0.85 }}>Veuillez patienter...</div>}
        {status === "ok" && <div style={{ fontSize: 14, opacity: 0.9 }}>{message}</div>}
        {status === "error" && (
          <div style={{ fontSize: 14, color: "#b91c1c" }}>
            Erreur
            <div style={{ marginTop: 6, color: "#b91c1c", opacity: 0.9 }}>{message}</div>
          </div>
        )}
      </div>
    </div>
  );
}
