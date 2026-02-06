"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function DigigoRedirectClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string>("");

  const token = useMemo(() => s(sp.get("token") || ""), [sp]);
  const state = useMemo(() => s(sp.get("state") || ""), [sp]);

  useEffect(() => {
    if (!token || !state) {
      setStatus("error");
      setError("Retour DigiGo invalide.");
      return;
    }

    (async () => {
      const r = await fetch("/api/digigo/callback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, state }),
      });

      const j = await r.json().catch(() => ({}));

      if (r.ok && j?.ok && j?.invoice_id) {
        router.replace(`/invoices/${j.invoice_id}`);
        return;
      }

      setStatus("error");
      setError(s(j?.error || j?.message || "Signature non finalisée."));
    })();
  }, [token, state, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-white/70 backdrop-blur p-6 shadow-sm">
        <div className="text-xl font-semibold">Finalisation de la signature</div>
        <div className="text-sm text-slate-600 mt-2">
          {status === "loading" ? "Veuillez patienter…" : "Une erreur est survenue."}
        </div>

        {status === "loading" ? (
          <div className="mt-6">
            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full w-1/2 bg-slate-800/80 rounded-full animate-pulse" />
            </div>
            <div className="text-xs text-slate-500 mt-3">Traitement sécurisé en cours.</div>
          </div>
        ) : (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-3 flex-wrap">
          <button className="ftn-btn" onClick={() => router.replace("/")} type="button">
            Accueil
          </button>
          <button className="ftn-btn-outline" onClick={() => router.back()} type="button">
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}
