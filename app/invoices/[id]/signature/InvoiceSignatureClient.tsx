"use client";

import { useEffect, useRef, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

function mapError(codeOrMessage: string) {
  const raw = s(codeOrMessage);
  if (!raw) return "Erreur DigiGo.";

  const looksLikeCode =
    raw.length <= 40 && /^[A-Z0-9_]+$/.test(raw.replaceAll(" ", "_"));
  if (!looksLikeCode) return raw;

  const c = raw.toUpperCase();

  if (c === "UNAUTHORIZED") return "Session expirée. Reconnectez-vous.";
  if (c === "FORBIDDEN") return "Accès refusé.";
  if (c === "INVOICE_NOT_FOUND") return "Facture introuvable.";
  if (c === "COMPANY_NOT_FOUND") return "Société introuvable.";
  if (c === "TTN_NOT_CONFIGURED")
    return "TTN n’est pas configuré. Ouvrez Paramètres TTN et configurez la signature DigiGo.";

  return raw;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700">
      {children}
    </span>
  );
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
    <div className="rounded-2xl border bg-white/70 p-5 sm:p-6 shadow">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-lg sm:text-xl font-semibold">Signature DigiGo</div>
          <div className="mt-1 text-sm text-slate-600">
            Redirection vers DigiGo pour autoriser la signature. Vous reviendrez automatiquement après validation.
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Pill>Facture: {invoiceId.slice(0, 8)}…</Pill>
            <Pill>Mode: DigiGo</Pill>
          </div>
        </div>

        <a className="ftn-btn-ghost" href={backUrl}>
          Retour
        </a>
      </div>

      {msg ? (
        <div
          className={`mt-5 rounded-xl border p-3 text-sm ${
            msg.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="mt-5">
        <div className="h-2 w-full bg-slate-200 rounded overflow-hidden">
          <div className={`h-full transition-all ${loading ? "w-2/4" : "w-1/4"} bg-slate-800`} />
        </div>
        <div className="mt-2 text-xs text-slate-500">Étapes : Initialisation → Redirection DigiGo → Signature</div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <button className="ftn-btn" onClick={startAndRedirect} disabled={loading} type="button">
          {loading ? "Redirection…" : "Continuer vers DigiGo"}
        </button>

        <button className="ftn-btn ftn-btn-ghost" onClick={startAndRedirect} disabled={loading} type="button">
          Relancer
        </button>
      </div>
    </div>
  );
}
