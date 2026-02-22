"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function RedirectUi() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = s(params.get("token"));

  async function run() {
    try {
      setBusy(true);
      setError("");

      if (!token) {
        setError("TOKEN_MANQUANT");
        return;
      }

      const res = await fetch("/api/digigo/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(s(data?.error) || "CALLBACK_FAILED");

      const back = s(data?.back_url) || "/invoices";
      window.location.href = back;
    } catch (e: any) {
      setError(s(e?.message) || "ERREUR");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    run();
  }, []);

  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-rose-50 flex items-center justify-center">
              <span className="text-rose-600 font-bold">!</span>
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-900">
                {error ? "Erreur" : "Finalisation de la signature"}
              </div>
              <div className="text-sm text-slate-600">
                {error ? "Session introuvable." : busy ? "Connexion DigiGo…" : "Terminé."}
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-xs uppercase tracking-wide text-rose-700 font-semibold">Erreur</div>
              <div className="mt-1 text-sm text-rose-800">{error}</div>
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={() => (window.location.href = "/invoices")}
              disabled={busy}
            >
              Retour à la facture
            </button>

            <button
              className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              onClick={run}
              disabled={busy}
            >
              Réessayer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
