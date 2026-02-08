"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

type ApiOk = { ok: true; invoice_id?: string; redirect?: string };
type ApiErr = {
  ok: false;
  error?: string;
  message?: string;
  details?: any;
  status?: number;
  body?: any;
};

export default function DigigoRedirectClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const token = useMemo(() => s(sp.get("token") || ""), [sp]);
  const code = useMemo(() => s(sp.get("code") || ""), [sp]);
  const state = useMemo(() => s(sp.get("state") || ""), [sp]);
  const invoice_id = useMemo(() => s(sp.get("invoice_id") || ""), [sp]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<ApiErr | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);

      if (!token && !code && !state && !invoice_id) {
        setLoading(false);
        setErr({ ok: false, error: "MISSING_PARAMS", message: "Paramètres manquants dans l’URL." });
        return;
      }

      try {
        const r = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code, state, invoice_id }),
          cache: "no-store",
        });

        const text = await r.text();
        let json: any = {};
        try {
          json = JSON.parse(text);
        } catch {
          json = { ok: false, error: "NON_JSON_RESPONSE", body: text, status: r.status };
        }

        if (cancelled) return;

        if (!r.ok || !json?.ok) {
          setLoading(false);
          setErr({
            ok: false,
            error: s(json?.error || `HTTP_${r.status}`),
            message: s(json?.message || "Échec de la finalisation DigiGo."),
            details: json?.details ?? json?.body ?? text,
            status: r.status,
          });
          return;
        }

        const ok = json as ApiOk;
        const redir = s(ok.redirect || "");
        const inv = s(ok.invoice_id || invoice_id || "");

        setLoading(false);

        if (redir) {
          router.replace(redir);
        } else if (inv) {
          router.replace(`/invoices/${inv}`);
        } else {
          router.replace("/");
        }
      } catch (e: any) {
        if (cancelled) return;
        setLoading(false);
        setErr({ ok: false, error: "FETCH_FAILED", message: "Erreur réseau.", details: s(e?.message || e) });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, code, state, invoice_id, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border bg-white/70 p-6 shadow">
        <div className="text-xl font-semibold">Finalisation de la signature</div>

        {loading && (
          <div className="mt-4">
            <div className="h-2 w-full bg-slate-200 rounded overflow-hidden">
              <div className="h-full w-1/2 bg-slate-700 animate-pulse"></div>
            </div>
            <div className="text-sm text-slate-600 mt-3">Traitement sécurisé en cours…</div>
          </div>
        )}

        {!loading && err && (
          <div className="mt-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              <div className="font-semibold">{err.message || "Échec de la finalisation DigiGo."}</div>
              <div className="text-sm mt-2">
                <div>
                  <span className="font-medium">Erreur:</span> {err.error || "UNKNOWN"}
                </div>
                {typeof err.status === "number" && (
                  <div>
                    <span className="font-medium">HTTP:</span> {err.status}
                  </div>
                )}
              </div>
              {err.details ? (
                <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-red-800/90 bg-white/50 border border-red-200 rounded-lg p-3">
{typeof err.details === "string" ? err.details : JSON.stringify(err.details, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
