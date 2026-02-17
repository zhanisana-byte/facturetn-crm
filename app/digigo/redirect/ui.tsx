"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function RedirectUi() {
  const [error, setError] = useState<string>("");
  const [done, setDone] = useState<boolean>(false);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const code = s(params.get("code"));
  const stateFromUrl = s(params.get("state"));
  const token = s(params.get("token"));

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");

        const ctxRes = await fetch("/api/digigo/context", { cache: "no-store" });
        const ctx = await ctxRes.json().catch(() => ({}));

        const invoice_id = s(ctx?.invoice_id);
        const back_url = s(ctx?.back_url) || "/invoices";
        const state = stateFromUrl || s(ctx?.state);

        if (!invoice_id) {
          setError("MISSING_INVOICE_CONTEXT");
          return;
        }

        if (!state) {
          setError("MISSING_STATE");
          return;
        }

        if (!token && !code) {
          setError("MISSING_CODE_OR_TOKEN");
          return;
        }

        const cbRes = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code, state }),
        });

        const cb = await cbRes.json().catch(() => ({}));
        if (!cbRes.ok || !cb?.ok) {
          setError(s(cb?.error || "CALLBACK_FAILED"));
          return;
        }

        if (cancelled) return;
        setDone(true);

        window.location.href = back_url;
      } catch (e: any) {
        setError(s(e?.message || "UNKNOWN_ERROR"));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [code, stateFromUrl, token]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-sm">
        <div className="text-2xl font-semibold">Redirection DigiGo</div>
        <div className="text-sm text-slate-600 mt-1">Traitement en cours...</div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
            {error}
          </div>
        ) : done ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm">
            OK
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700 text-sm">
            ...
          </div>
        )}
      </div>
    </div>
  );
}
