"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Status = "loading" | "success" | "error";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function Ui() {
  const router = useRouter();
  const params = useSearchParams();

  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const token = s(params.get("token"));
    const code = s(params.get("code"));
    const stateParam = s(params.get("state"));

    if (!token && !code) {
      setStatus("error");
      setMessage("Retour DigiGo invalide (token/code manquant).");
      return;
    }

    if (!stateParam) {
      setStatus("error");
      setMessage("Retour DigiGo invalide (state manquant).");
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
            state: stateParam,
          }),
        });

        const j = await res.json().catch(() => ({}));

        if (!res.ok || !j?.ok) {
          setStatus("error");
          setMessage(s(j?.message || j?.error || "Échec de la finalisation DigiGo."));
          return;
        }

        const redirect = s(j?.redirect || "");
        setStatus("success");
        setMessage("Signature finalisée avec succès.");

        setTimeout(() => {
          router.replace(redirect || "/");
        }, 600);
      } catch (e: any) {
        setStatus("error");
        setMessage(s(e?.message || "Erreur réseau."));
      }
    }

    finalize();
  }, [params, router]);

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
