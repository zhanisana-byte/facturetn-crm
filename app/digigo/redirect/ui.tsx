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

function getHashParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  const h = String(window.location.hash || "");
  const raw = h.startsWith("#") ? h.slice(1) : h;
  return new URLSearchParams(raw);
}

export default function DigiGoRedirectUI() {
  const router = useRouter();
  const sp = useSearchParams();
  const params = useParams<{ state?: string }>();

  const tokenQ = useMemo(() => s(sp.get("token") || ""), [sp]);
  const codeQ = useMemo(() => s(sp.get("code") || ""), [sp]);

  const stateQ = useMemo(() => {
    const fromQuery = s(sp.get("state") || "");
    const fromPath = s(params?.state || "");
    return fromQuery || fromPath;
  }, [sp, params]);

  const invoice_idQ = useMemo(() => s(sp.get("invoice_id") || ""), [sp]);
  const back_urlQ = useMemo(() => s(sp.get("back_url") || sp.get("back") || ""), [sp]);

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const hp = getHashParams();

        const codeH = s(hp.get("code") || "");
        const stateH = s(hp.get("state") || "");
        const tokenH = s(hp.get("token") || hp.get("access_token") || "");

        const token = tokenQ || tokenH;
        const code = codeQ || codeH;
        const state = stateQ || stateH;

        const invoice_id = invoice_idQ;
        const back_url = back_urlQ;

        if (!token && !code) {
          throw new Error("MISSING_TOKEN_OR_CODE");
        }

        const res = await fetch("/api/digigo/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code, state, invoice_id, back_url }),
          cache: "no-store",
          credentials: "include",
        });

        const { j, txt } = await readJsonOrText(res);

        if (!res.ok || !j?.ok) {
          const msg = s(j?.message || j?.error || txt || `HTTP_${res.status}`);
          throw new Error(msg);
        }

        const redirect = s(j?.redirect || back_url || "/");
        if (!cancelled) router.replace(redirect);
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setMessage(s(e?.message || "INTERNAL_ERROR"));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router, tokenQ, codeQ, stateQ, invoice_idQ, back_urlQ]);

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

        {status === "loading" ? (
          <div style={{ fontSize: 14, opacity: 0.85 }}>Finalisation en cours...</div>
        ) : (
          <>
            <div style={{ fontSize: 14, color: "#b91c1c", marginBottom: 8 }}>Erreur</div>
            <div style={{ fontSize: 14, color: "#b91c1c" }}>{message}</div>
          </>
        )}
      </div>
    </div>
  );
}
