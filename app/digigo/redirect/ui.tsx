"use client";

import { useEffect, useMemo, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function RedirectUi() {
  const [error, setError] = useState<string>("");
  const [done, setDone] = useState<boolean>(false);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const code = s(params.get("code"));
  const token = s(params.get("token"));

  const invoiceId = s(params.get("invoiceId") || params.get("invoice_id") || params.get("id"));
  const state = s(params.get("state"));
  const back = s(params.get("back"));

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setError("");

        if (!invoiceId) {
          setError("MISSING_INVOICE_ID");
          return;
        }
        if (!state) {
          setError("MISSING_STATE");
          return;
        }
        if (!token && !code) {
          setError("MISSING_CODE_OR_TOKEN");
          return;
        }

        if (token) {
          const cfRes = await fetch("/api/digigo/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ invoiceId, token, code, state }),
            cache: "no-store",
          });

          const cf = await cfRes.json().catch(() => ({}));
          if (!cfRes.ok || !cf?.ok) {
            setError(s(cf?.error || cf?.message || "CONFIRM_FAILED"));
            return;
          }
        }

        const cbRes = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, state }),
          cache: "no-store",
        });

        const cb = await cbRes.json().catch(() => ({}));
        if (!cbRes.ok || !cb?.ok) {
          setError(s(cb?.error || cb?.details || "CALLBACK_FAILED"));
          return;
        }

        if (cancelled) return;
        setDone(true);

        const redirect = s(cb?.redirect) || back || `/invoices/${invoiceId}`;
        window.location.href = redirect;
      } catch (e: any) {
        setError(s(e?.message || "UNKNOWN_ERROR"));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [code, token, invoiceId, state, back]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-sm">
        <div className="text-2xl font-semibold">Finalisation de la signature</div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">{error}</div>
        ) : done ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm">OK</div>
        ) : (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700 text-sm">...</div>
        )}
      </div>
    </div>
  );
}
