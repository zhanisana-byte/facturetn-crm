"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

type UiState =
  | { kind: "loading"; title: string; subtitle?: string }
  | { kind: "success"; title: string; subtitle?: string }
  | { kind: "error"; title: string; subtitle?: string; details?: string };

export default function DigigoRedirectPage() {
  const router = useRouter();

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = s(params.get("token"));
  const stateFromUrl = s(params.get("state"));

  const [ui, setUi] = useState<UiState>({
    kind: "loading",
    title: "Finalisation de la signature",
    subtitle: "Traitement en cours…",
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setUi({
          kind: "loading",
          title: "Finalisation de la signature",
          subtitle: "Traitement en cours…",
        });

        // 1) context (invoice_id + state attendu)
        const ctxRes = await fetch("/api/digigo/context", { cache: "no-store" });
        const ctx = await ctxRes.json().catch(() => ({}));

        const invoice_id = s(ctx?.invoice_id ?? ctx?.invoiceId);
        const stateExpected = s(ctx?.state);

        if (!invoice_id) {
          if (!cancelled) setUi({ kind: "error", title: "Erreur", subtitle: "Session introuvable." });
          return;
        }

        const effectiveState = stateFromUrl || stateExpected;
        if (!effectiveState) {
          if (!cancelled) setUi({ kind: "error", title: "Erreur", subtitle: "MISSING_STATE" });
          return;
        }

        // 2) finalize : on passe invoiceId + state (+ token si présent)
        const finRes = await fetch("/api/digigo/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            invoiceId: invoice_id,
            state: effectiveState,
            token,
          }),
        });

        const fin = await finRes.json().catch(() => ({}));

        if (!finRes.ok || !fin?.ok) {
          const msg = s(fin?.error || fin?.message || "INTERNAL_ERROR");
          const details = s(fin?.details || "");
          if (!cancelled) {
            setUi({
              kind: "error",
              title: "Finalisation de la signature",
              subtitle: "Impossible de finaliser la signature.",
              details: msg + (details ? `\n${details}` : ""),
            });
          }
          return;
        }

        if (!cancelled) {
          setUi({
            kind: "success",
            title: "Finalisation de la signature",
            subtitle: "OK",
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setUi({
            kind: "error",
            title: "Finalisation de la signature",
            subtitle: "Impossible de finaliser la signature.",
            details: s(e?.message || "fetch failed"),
          });
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router, token, stateFromUrl]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div
            className={[
              "mt-0.5 h-10 w-10 rounded-full flex items-center justify-center",
              ui.kind === "success"
                ? "bg-emerald-50 text-emerald-600"
                : ui.kind === "error"
                ? "bg-rose-50 text-rose-600"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {ui.kind === "success" ? "✓" : ui.kind === "error" ? "!" : "…"}
          </div>

          <div className="flex-1">
            <h1 className="text-base font-semibold text-slate-900">{ui.title}</h1>
            {ui.subtitle ? <p className="mt-1 text-sm text-slate-600">{ui.subtitle}</p> : null}
          </div>
        </div>

        {ui.kind === "error" ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-medium text-rose-700">Erreur</p>
            {ui.details ? (
              <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-rose-800">
                {ui.details}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Retour à la facture
          </button>

          {ui.kind === "error" ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Réessayer
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
