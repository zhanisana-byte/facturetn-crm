"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function s(v: any) {
  return String(v ?? "").trim();
}

function getStored(key: string) {
  let v = "";
  try {
    v = s(window.sessionStorage.getItem(key) || "");
  } catch {}
  if (v) return v;

  try {
    v = s(window.localStorage.getItem(key) || "");
  } catch {}
  return v;
}

function clearStored(keys: string[]) {
  for (const k of keys) {
    try {
      window.sessionStorage.removeItem(k);
    } catch {}
    try {
      window.localStorage.removeItem(k);
    } catch {}
  }
}

export default function Ui() {
  const router = useRouter();
  const sp = useSearchParams();

  const token = useMemo(() => s(sp.get("token")), [sp]);
  const code = useMemo(() => s(sp.get("code")), [sp]);
  const stateFromUrl = useMemo(() => s(sp.get("state")), [sp]);

  const [error, setError] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      const state = stateFromUrl || getStored("digigo_state");
      const invoiceId = getStored("digigo_invoice_id");

      if (!token && !code) {
        setError("Retour DigiGo invalide (token/code manquant).");
        return;
      }

      // ✅ Toujours récupérer la session côté client (fiable)
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = s(data?.session?.access_token || "");

      if (!accessToken) {
        // pas de session => on renvoie vers login, en gardant l’url de retour
        const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
        router.replace(`/login?returnTo=${returnTo}`);
        return;
      }

      try {
        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            token: token || undefined,
            code: code || undefined,
            state: state || undefined,
            invoice_id: !state ? invoiceId || undefined : undefined,
          }),
        });

        const json = await res.json().catch(() => ({}));

        if (res.ok && json?.ok && json?.invoice_id) {
          clearStored(["digigo_state", "digigo_invoice_id"]);
          router.replace(`/invoices/${json.invoice_id}`);
          return;
        }

        setError(s(json?.error || json?.message || "La signature DigiGo a échoué."));
      } catch {
        setError("Erreur réseau lors de la finalisation DigiGo.");
      }
    };

    run();
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
