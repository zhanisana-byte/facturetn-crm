"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

type CallbackOk = {
  ok: true;
  invoice_id: string;
  state: string;
  back_url?: string;
};

type CallbackErr = {
  ok: false;
  error: string;
  details?: string;
};

export default function RedirectUi() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = s(params.get("token"));

  const [loading, setLoading] = useState(true);
  const [res, setRes] = useState<CallbackOk | CallbackErr | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setLoading(true);
        setRes(null);

        if (!token) {
          if (!cancelled) setRes({ ok: false, error: "MISSING_TOKEN" });
          return;
        }

        const r = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
        });
        const j = (await r.json().catch(() => null)) as any;

        if (!cancelled) setRes(j);
      } catch (e: any) {
        if (!cancelled) setRes({ ok: false, error: "NETWORK_ERROR", details: s(e?.message || e) });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const ok = res && (res as any).ok === true;
  const backUrl = ok ? s((res as any).back_url) : "";

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white/80 backdrop-blur shadow-sm">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center ${
                loading ? "bg-slate-100" : ok ? "bg-emerald-100" : "bg-rose-100"
              }`}
            >
              {loading ? (
                <span className="h-4 w-4 rounded-full bg-slate-300 animate-pulse" />
              ) : ok ? (
                <span className="text-emerald-700 font-bold">✓</span>
              ) : (
                <span className="text-rose-700 font-bold">!</span>
              )}
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-900">Finalisation de la signature</div>
              <div className="text-sm text-slate-600">
                {loading ? "Traitement en cours…" : ok ? "Signature enregistrée." : "Impossible de finaliser la signature."}
              </div>
            </div>
          </div>

          <div className="mt-5">
            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Merci de patienter…</div>
            ) : ok ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="font-semibold">OK</div>
                <div className="mt-1 text-emerald-800/80">Vous pouvez revenir à la facture pour continuer.</div>
              </div>
            ) : (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                <div className="font-semibold">Erreur</div>
                <div className="mt-1">{s((res as any)?.error) || "UNKNOWN"}</div>
                {s((res as any)?.details) ? <div className="mt-2 text-rose-800/80">{s((res as any)?.details)}</div> : null}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => {
                if (backUrl) window.location.href = backUrl;
                else window.location.href = "/";
              }}
              className="inline-flex justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Retour à la facture
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Réessayer
            </button>
          </div>

          <div className="mt-5 text-xs text-slate-500">
            Remarque 1 : la session expire après un délai (ex: 10–30 min). Si elle a expiré, relance la signature.
            <br />
            Remarque 2 : évite d’ouvrir plusieurs signatures en parallèle (plusieurs onglets) pour ne pas mélanger les sessions.
          </div>
        </div>
      </div>
    </div>
  );
}
