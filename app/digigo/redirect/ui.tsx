"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function DigigoRedirectPage() {
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    const p = new URLSearchParams(window.location.search);
    return s(p.get("token"));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");
        setDone(false);

        if (!token) {
          setError("MISSING_TOKEN");
          return;
        }

        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ token }),
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          setError(s(json?.error) || "CALLBACK_FAILED");
          return;
        }

        const redirect = s(json?.redirect) || "/";
        setDone(true);

        if (!cancelled) window.location.replace(redirect);
      } catch (e: any) {
        setError(s(e?.message || e) || "REDIRECT_FATAL");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white/70 backdrop-blur p-8 shadow-sm">
        <div className="text-xl font-semibold">Signature DigiGo</div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            <div className="font-semibold">Erreur</div>
            <div className="mt-1">{error}</div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            <div className="font-semibold">
              {done ? "Signature finalisée" : "Finalisation de la signature..."}
            </div>
            <div className="mt-1 text-sm">
              {done ? "Redirection..." : "Veuillez patienter."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
