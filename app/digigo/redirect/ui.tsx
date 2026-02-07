"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

function getStored(key: string) {
  try {
    const v = s(window.localStorage.getItem(key));
    if (v) return v;
  } catch {}
  try {
    const v = s(window.sessionStorage.getItem(key));
    if (v) return v;
  } catch {}
  return "";
}

function setStored(key: string, val: string) {
  const v = s(val);
  if (!v) return;
  try {
    window.localStorage.setItem(key, v);
  } catch {}
  try {
    window.sessionStorage.setItem(key, v);
  } catch {}
}

function clearStored(keys: string[]) {
  for (const k of keys) {
    try {
      window.localStorage.removeItem(k);
    } catch {}
    try {
      window.sessionStorage.removeItem(k);
    } catch {}
  }
}

export default function Ui() {
  const sp = useSearchParams();
  const router = useRouter();

  const token = useMemo(() => s(sp.get("token")), [sp]);
  const code = useMemo(() => s(sp.get("code")), [sp]);
  const stateFromUrl = useMemo(() => s(sp.get("state")), [sp]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setErr("");

      const storedInvoiceId =
        getStored("digigo_invoice_id") ||
        getStored("ftn_digigo_invoice_id") ||
        getStored("invoice_id");

      const storedState =
        getStored("digigo_state") ||
        getStored("ftn_digigo_state");

      const invoice_id = storedInvoiceId;
      const state = stateFromUrl || storedState; // ✅ IMPORTANT: state peut manquer dans l’URL DigiGo

      if (!token && !code) {
        setErr("Retour DigiGo invalide (token/code manquant).");
        setLoading(false);
        return;
      }

      if (!invoice_id) {
        setErr("Contexte de signature introuvable (invoice_id manquant). Relancez la signature.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token,
            code,
            invoice_id,
            state, // peut être vide -> backend accepte
          }),
        });

        const j = await res.json().catch(() => ({}));

        if (!res.ok || !j?.ok) {
          const e = s(j?.message || j?.error || "Erreur inconnue");
          // Si session perdue:
          if (res.status === 401 || e.toLowerCase().includes("unauthorized")) {
            setErr("UNAUTHORIZED — reconnectez-vous puis relancez la signature.");
            setLoading(false);
            return;
          }
          setErr(e);
          setLoading(false);
          return;
        }

        clearStored([
          "digigo_invoice_id",
          "ftn_digigo_invoice_id",
          "invoice_id",
          "digigo_state",
          "ftn_digigo_state",
        ]);

        const backUrl = getStored("digigo_back_url") || getStored("ftn_digigo_back_url");
        if (backUrl) {
          try {
            window.location.href = backUrl;
            return;
          } catch {}
        }

        router.replace(`/invoices/${encodeURIComponent(invoice_id)}?signed=1`);
      } catch (e: any) {
        setErr(s(e?.message || e));
        setLoading(false);
      }
    };

    run();
  }, [token, code, stateFromUrl, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-white/70 p-6 shadow">
        <div className="text-xl font-semibold">Finalisation de la signature</div>

        {loading && !err ? (
          <div className="mt-4">
            <div className="h-2 w-full bg-slate-200 rounded overflow-hidden">
              <div className="h-full w-1/2 bg-slate-700 animate-pulse" />
            </div>
            <div className="text-sm text-slate-600 mt-3">Traitement sécurisé en cours…</div>
          </div>
        ) : null}

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}
      </div>
    </div>
  );
}
