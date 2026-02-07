"use client";

import { useEffect, useRef, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

function mapError(codeOrMessage: string) {
  const raw = s(codeOrMessage);
  if (!raw) return "Erreur DigiGo.";

  const looksLikeCode = raw.length <= 40 && /^[A-Z0-9_]+$/.test(raw.replaceAll(" ", "_"));
  if (!looksLikeCode) return raw;

  const c = raw.toUpperCase();

  if (c === "UNAUTHORIZED") return "Session expirée. Reconnectez-vous.";
  if (c === "FORBIDDEN") return "Accès refusé.";
  if (c === "INVOICE_NOT_FOUND") return "Facture introuvable.";
  if (c === "COMPANY_NOT_FOUND") return "Société introuvable.";
  if (c === "TTN_NOT_CONFIGURED")
    return "TTN n’est pas configuré. Ouvrez Paramètres TTN et configurez la signature DigiGo.";
  if (c === "EMAIL_DIGIGO_COMPANY_MISSING")
    return "Renseignez l’email DigiGo dans Paramètres DigiGo (société).";
  if (c === "MISSING_INVOICE_ID") return "Identifiant facture manquant.";
  if (c === "SIGNATURE_CONTEXT_INSERT_FAILED")
    return "Impossible d'initialiser le contexte de signature. Réessayez.";

  return raw;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">
      {children}
    </span>
  );
}

function setEverywhere(key: string, value: string) {
  if (!value) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {}
  try {
    window.sessionStorage.setItem(key, value);
  } catch {}
}

export default function InvoiceSignatureClient({
  invoiceId,
  backUrl,
}: {
  invoiceId: string;
  backUrl: string;
}) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const startedOnce = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  function stopPending() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  async function startAndRedirect() {
    stopPending();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setMsg(null);
    setLoading(true);

    try {
      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
        signal: ctrl.signal,
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        const raw = s(j?.error || j?.message || "");
        setMsg({ ok: false, text: mapError(raw) });
        return;
      }

      const authorizeUrl = s(j?.authorize_url || "");
      if (!authorizeUrl) {
        setMsg({ ok: false, text: "URL DigiGo manquante. Vérifiez la configuration." });
        return;
      }

      const state = s(j?.state || "");
      if (state) setEverywhere("digigo_state", state);
      setEverywhere("digigo_invoice_id", invoiceId);
      setEverywhere("digigo_back_url", backUrl);

      window.location.href = authorizeUrl;
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (startedOnce.current) return;
    startedOnce.current = true;
    startAndRedirect();
    return () => stopPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-lg font-semibold text-slate-900">Signature DigiGo</div>
            <div className="text-sm text-slate-600">Vous allez être redirigé pour signer le hash TEIF.</div>
          </div>
          <Pill>Invoice: {invoiceId}</Pill>
        </div>

        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {loading ? "Préparation de la signature…" : "Initialisation…"}
        </div>

        {msg && (
          <div
            className={[
              "mt-4 rounded-xl border p-4 text-sm",
              msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800",
            ].join(" ")}
          >
            {msg.text}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => startAndRedirect()}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Relancer
          </button>

          <a
            href={backUrl}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            Retour
          </a>
        </div>
      </div>
    </div>
  );
}
