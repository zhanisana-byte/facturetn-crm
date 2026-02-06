"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

function getStored(key: string) {
  let v = "";
  try {
    v = s(window.localStorage.getItem(key) || "");
  } catch {}
  if (v) return v;

  try {
    v = s(window.sessionStorage.getItem(key) || "");
  } catch {}
  return v;
}

function clearStored() {
  for (const k of ["digigo_state", "digigo_invoice_id"]) {
    try {
      window.localStorage.removeItem(k);
    } catch {}
    try {
      window.sessionStorage.removeItem(k);
    } catch {}
  }
}

export default function DigigoRedirectClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const token = useMemo(() => s(sp.get("token") || ""), [sp]);
  const code = useMemo(() => s(sp.get("code") || ""), [sp]);
  const stateFromUrl = useMemo(() => s(sp.get("state") || ""), [sp]);

  const [error, setError] = useState("");

  useEffect(() => {
    const oauthToken = code || token;
    if (!oauthToken) {
      setError("Retour DigiGo invalide.");
      return;
    }

    const state = stateFromUrl || getStored("digigo_state");
    const invoice_id = getStored("digigo_invoice_id");

    if (!state && !invoice_id) {
      setError("Retour DigiGo invalide.");
      return;
    }

    (async () => {
      try {
        const r = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token: token || undefined,
            code: code || undefined,
            state: state || undefined,
            invoice_id: !state ? invoice_id : undefined,
          }),
        });

        const j = await r.json().catch(() => ({}));

        if (r.ok && j?.ok && j?.invoice_id) {
          clearStored();
          router.replace(`/invoices/${j.invoice_id}`);
          return;
        }

        setError(s(j?.error || j?.message || "Signature échouée."));
      } catch {
        setError("Erreur réseau (fetch failed).");
      }
    })();
  }, [token, code, stateFromUrl, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-white/70 p-6 shadow">
        <div className="text-xl font-semibold">Finalisation de la signature</div>

        {!error ? (
          <div className="mt-4">
            <div className="h-2 w-full bg-slate-200 rounded overflow-hidden">
              <div className="h-full w-1/2 bg-slate-700 animate-pulse" />
            </div>
            <div className="text-sm text-slate-600 mt-3">Traitement sécurisé en cours…</div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
