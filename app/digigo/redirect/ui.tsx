"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const fired = useRef(false);

  const token = useMemo(() => s(sp.get("token") || ""), [sp]);
  const code = useMemo(() => s(sp.get("code") || ""), [sp]);
  const stateFromUrl = useMemo(() => s(sp.get("state") || ""), [sp]);
  const invoiceIdFromUrl = useMemo(() => s(sp.get("invoice_id") || ""), [sp]);

  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const storedState = getStored("digigo_state");
    const storedInvoiceId = getStored("digigo_invoice_id");
    const storedBackUrl = getStored("digigo_back_url");

    const state = stateFromUrl || storedState;
    const invoiceId = storedInvoiceId || invoiceIdFromUrl;

    if (!token && !code) {
      setError("Retour DigiGo invalide.");
      return;
    }

    if (!state) {
      setError("State manquant. Relancez la signature.");
      return;
    }

    if (!invoiceId) {
      setError("Invoice manquante. Relancez la signature.");
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
            state,
            invoice_id: invoiceId,
          }),
        });

        const j = await r.json().catch(() => ({}));

        if (r.ok && j?.ok && j?.invoice_id) {
          clearStored(["digigo_state", "digigo_invoice_id", "digigo_back_url"]);
          setDone(true);

          const target = s(storedBackUrl) || `/invoices/${j.invoice_id}`;
          router.replace(target);
          return;
        }

        setError(s(j?.message || j?.error || "Signature échouée."));
      } catch (e: any) {
        setError(s(e?.message || "Erreur réseau."));
      }
    })();
  }, [token, code, stateFromUrl, invoiceIdFromUrl, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-white/70 p-6 shadow">
        <div className="text-xl font-semibold">Finalisation de la signature</div>

        {!error ? (
          <div className="mt-4">
            <div className="h-2 w-full bg-slate-200 rounded overflow-hidden">
              <div className="h-full w-1/2 bg-slate-700 animate-pulse" />
            </div>
            <div className="text-sm text-slate-600 mt-3">
              {done ? "Signature terminée. Redirection…" : "Traitement sécurisé en cours…"}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}
      </div>
    </div>
  );
}
