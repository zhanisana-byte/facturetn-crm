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
  const state = s(params.get("state"));
  const urlError = s(params.get("error"));

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");

        if (urlError) {
          setError(urlError);
          return;
        }

        if (!token) {
          setError("MISSING_TOKEN");
          return;
        }

        if (!state) {
          setError("MISSING_STATE");
          return;
        }

        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, state }),
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(s(json?.error) || "ERROR");
          return;
        }

        const backUrl = s(json?.back_url) || "/";
        setDone(true);
        window.location.replace(backUrl);
      } catch (e: any) {
        if (!cancelled) setError(s(e?.message) || "ERROR");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, state, urlError]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white/60 backdrop-blur p-6 shadow-sm">
        <div className="text-sm text-gray-600">DigiGo</div>
        <div className="mt-2 text-xl font-semibold">Redirection</div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : done ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
            OK
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700">
            Traitement...
          </div>
        )}
      </div>
    </div>
  );
}
