"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Status = "loading" | "success" | "error";

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

function extractInvoiceIdFromState(state: string) {
  const st = s(state);
  if (!st) return "";
  const m = st.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i
  );
  return m ? m[1] : "";
}

export default function Ui() {
  const router = useRouter();
  const params = useSearchParams();

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState("");

  useEffect(() => {
    const token = s(params.get("token"));
    const code = s(params.get("code"));

    const stateFromUrl = s(params.get("state"));
    const stateStored = getStored("digigo_state");
    const state = stateFromUrl || stateStored;

    const invoiceIdParam = s(params.get("invoice_id"));
    const invoiceId =
      invoiceIdParam ||
      getStored("digigo_invoice_id") ||
      getStored("invoice_id") ||
      (state ? extractInvoiceIdFromState(state) : "");

    const backUrl =
      getStored("digigo_back_url") || (invoiceId ? `/invoices/${invoiceId}` : "/");

    if (!token && !code) {
      setStatus("error");
      setMessage("Retour DigiGo invalide (token/code manquant).");
      return;
    }

    if (!state && !invoiceId) {
      setStatus("error");
      setMessage("Contexte manquant (state/invoice_id). Relance la signature depuis la facture.");
      setDetails("Ne teste pas en ouvrant /digigo/redirect manuellement. Utilise le bouton 'Signer avec DigiGo'.");
      return;
    }

    async function finalize() {
      try {
        const payload: any = { token, code };
        if (state) payload.state = state;
        if (!state && invoiceId) payload.invoice_id = invoiceId;

        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        const j = await res.json().catch(() => ({}));

        if (!res.ok || !j?.ok) {
          setStatus("error");
          setMessage(s(j?.message || j?.error || "Échec de la finalisation DigiGo."));
          return;
        }

        setStatus("success");
        setMessage("Signature finalisée avec succès.");

        clearStored(["digigo_invoice_id", "invoice_id", "digigo_state", "digigo_back_url"]);

        const redir = s(j?.redirect || "");
        setTimeout(() => {
          router.replace(redir || backUrl);
        }, 600);
      } catch (e: any) {
        setStatus("error");
        setMessage(s(e?.message || "Erreur réseau."));
      }
    }

    finalize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-white/70 p-6 shadow">
        <div className="text-xl font-semibold">Finalisation de la signature</div>

        {status === "loading" && (
          <div className="mt-4">
            <div className="h-2 w-full bg-slate-200 rounded overflow-hidden">
              <div className="h-full w-1/2 bg-slate-700 animate-pulse" />
            </div>
            <div className="text-sm text-slate-600 mt-3">Traitement sécurisé en cours…</div>
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <div>{message}</div>
            {details ? <div className="mt-2 text-xs text-red-700/80">{details}</div> : null}
          </div>
        )}

        {status === "success" && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
