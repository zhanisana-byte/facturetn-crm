// app/digigo/redirect/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function DigiGoRedirectPage() {
  const [err, setErr] = useState<string>("");
  const [done, setDone] = useState(false);

  const params = useMemo(() => {
    const u = new URL(window.location.href);
    return {
      code: s(u.searchParams.get("code")),
      state: s(u.searchParams.get("state")),
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const code = params.code;
        const state = params.state;
        if (!code || !state) {
          setErr("MISSING_CODE_OR_STATE");
          return;
        }

        const back_url = s(sessionStorage.getItem("digigo_back_url"));
        const r = await fetch("/api/digigo/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, state, back_url }),
          credentials: "include",
          cache: "no-store",
        });

        const t = await r.text().catch(() => "");
        let j: any = {};
        try {
          j = t ? JSON.parse(t) : {};
        } catch {
          j = {};
        }

        if (!r.ok || !j?.ok) {
          setErr(s(j?.error || j?.message || t || `HTTP_${r.status}`));
          return;
        }

        const go = s(j?.back_url) || back_url || "/";
        setDone(true);
        window.location.href = go;
      } catch (e: any) {
        setErr(s(e?.message || "REDIRECT_FAILED"));
      }
    })();
  }, [params.code, params.state]);

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <div className="text-xl font-semibold">Redirection DigiGo</div>
      <div className="mt-2 text-sm text-slate-600">Traitement en cours...</div>
      {err ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>
      ) : done ? (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">OK</div>
      ) : null}
    </div>
  );
}
