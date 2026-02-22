"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function RedirectUi() {
  const [error, setError] = useState<string>("");
  const [done, setDone] = useState<boolean>(false);

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

        const ctxRes = await fetch("/api/digigo/context", { cache: "no-store", credentials: "include" });
        const ctx = await ctxRes.json().catch(() => ({}));

        const invoice_id = s(ctx?.invoice_id);
        const state = s(ctx?.state);
        const back_url = s(ctx?.back_url);

        const cbRes = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ token, invoice_id, state, back_url }),
        });

        const cb = await cbRes.json().catch(() => ({}));

        if (!cbRes.ok || !cb?.ok) {
          setError(s(cb?.error) || `CALLBACK_HTTP_${cbRes.status}`);
          return;
        }

        setDone(true);

        const redirect = s(cb?.redirect) || (invoice_id ? `/invoices/${invoice_id}` : "/");
        window.location.assign(redirect);
      } catch (e: any) {
        setError(s(e?.message || e));
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-white/80 backdrop-blur p-6 shadow-sm">
        <div className="text-lg font-semibold">Finalisation de la signature</div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="font-semibold">Erreur</div>
            <div className="mt-1">{error}</div>
          </div>
        ) : done ? (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-green-700">
            <div className="font-semibold">OK</div>
            <div className="mt-1">Redirection…</div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border bg-gray-50 p-4 text-gray-700">Traitement…</div>
        )}
      </div>
    </div>
  );
}
