"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Status = "loading" | "success" | "error";

function s(v: any) {
  return String(v ?? "").trim();
}

function getStored(key: string) {
  try {
    return s(window.localStorage.getItem(key));
  } catch {}
  try {
    return s(window.sessionStorage.getItem(key));
  } catch {}
  return "";
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
  const router = useRouter();
  const params = useSearchParams();

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const token = s(params.get("token"));
    const code = s(params.get("code")); // fallback si DigiGo change
    const invoiceId =
      getStored("digigo_invoice_id") ||
      getStored("invoice_id");

    const backUrl =
      getStored("digigo_back_url") ||
      (invoiceId ? `/invoices/${invoiceId}` : "/");

    if (!token && !code) {
      setStatus("error");
      setMessage("Retour DigiGo invalide (token manquant).");
      return;
    }

    if (!invoiceId) {
      setStatus("error");
      setMessage("Contexte de signature introuvable (invoice_id manquant). Relancez la signature.");
      return;
    }

    async function finalize() {
      try {
        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token,
            code,
            invoice_id: invoiceId,
            state: getStored("digigo_state"),
          }),
        });

        const j = await res.json().catch(() => ({}));

        if (!res.ok || !j?.ok) {
          setStatus("error");
          setMessage(
            s(j?.message || j?.error || "Échec de la finalisation DigiGo.")
          );
          return;
        }

        setStatus("success");
        setMessage("Signature finalisée avec succès.");

        clearStored([
          "digigo_invoice_id",
          "digigo_state",
          "digigo_back_url",
        ]);

        setTimeout(() => {
          router.replace(backUrl);
        }, 1200);
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
        <div className="text-xl font-semibold">
          Finalisation de la signature
        </div>

        {status === "loading" && (
          <div className="mt-4">
            <div className="h-2 w-full bg-slate-200 rounded overflow-hidden">
              <div className="h-full w-1/2 bg-slate-700 animate-pulse" />
            </div>
            <div className="text-sm text-slate-600 mt-3">
              Traitement sécurisé en cours…
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {message}
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
