"use client";

import { useEffect, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

function getStored(key: string) {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
  } catch {}
  try {
    const v = sessionStorage.getItem(key);
    if (v) return v;
  } catch {}
  return "";
}

export default function RedirectUi() {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Traitement...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");

        const qs = new URLSearchParams(window.location.search);
        const token = s(qs.get("token"));
        const urlError = s(qs.get("error"));
        const urlState = s(qs.get("state"));

        if (urlError) {
          setError(urlError);
          setStatus("Erreur");
          return;
        }

        if (!token) {
          setError("MISSING_TOKEN");
          setStatus("Erreur");
          return;
        }

        const storedState = urlState || s(getStored("digigo_state"));
        const storedInvoiceId = s(getStored("digigo_invoice_id"));

        const res = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token,
            state: storedState || undefined,
            invoice_id: storedInvoiceId || undefined,
          }),
          cache: "no-store",
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok || !json?.ok) {
          setError(s(json?.error) || "ERROR");
          setStatus("Erreur");
          return;
        }

        const backUrl = s(json?.back_url) || "/";
        setStatus("OK");
        if (!cancelled) window.location.replace(backUrl);
      } catch (e: any) {
        if (!cancelled) {
          setError(s(e?.message) || "ERROR");
          setStatus("Erreur");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white/60 backdrop-blur p-6 shadow-sm">
        <div className="text-sm text-gray-600">DigiGo</div>
        <div className="mt-2 text-xl font-semibold">Redirection</div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-700">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
