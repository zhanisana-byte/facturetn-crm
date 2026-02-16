"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

async function readJsonOrText(res: Response) {
  const txt = await res.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }
  return { j, txt };
}

export default function DigiGoRedirectUI() {
  const router = useRouter();
  const sp = useSearchParams();
  const params = useParams<{ state?: string }>();

  const token = useMemo(() => s(sp.get("token") || ""), [sp]);
  const code = useMemo(() => s(sp.get("code") || ""), [sp]);

  const state = useMemo(() => {
    const fromQuery = s(sp.get("state") || "");
    const fromPath = s(params?.state || "");
    return fromQuery || fromPath;
  }, [sp, params]);

  const invoice_id = useMemo(() => s(sp.get("invoice_id") || ""), [sp]);
  const back_url = useMemo(() => s(sp.get("back_url") || sp.get("back") || ""), [sp]);

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (!token && !code) throw new Error("MISSING_TOKEN_OR_CODE");

        const res = await fetch("/api/digigo/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code, state, invoice_id, back_url }),
          cache: "no-store",
          credentials: "include",
        });

        const { j, txt } = await readJsonOrText(res);

        if (txt && txt.startsWith("<!DOCTYPE html")) {
          throw new Error(`API_RETURNED_HTML_HTTP_${res.status}`);
        }

        if (!res.ok || !j?.ok) {
          const details = s(j?.error || j?.message || j?.details || txt || `HTTP_${res.status}`);
          throw new Error(details);
        }

        const redirect = s(j?.redirect || "/app");
        router.replace(redirect);
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setMessage(s(e?.message || e || "Erreur"));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, code, state, invoice_id, back_url, router]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div
        style={{
          maxWidth: 640,
          width: "100%",
          padding: 20,
          borderRadius: 16,
          border: "1px solid rgba(148,163,184,.35)",
          background: "rgba(255,255,255,.85)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Connexion DigiGo</div>

        {status === "loading" && <div style={{ fontSize: 14, opacity: 0.85 }}>Finalisation en cours...</div>}

        {status === "error" && (
          <div style={{ fontSize: 14, color: "#b91c1c" }}>
            Erreur
            <div style={{ marginTop: 6, opacity: 0.9, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
              {message}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
