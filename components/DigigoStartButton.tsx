"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

function setEverywhere(key: string, val: string) {
  const v = s(val);
  if (!v) return;
  try { localStorage.setItem(key, v); } catch {}
  try { sessionStorage.setItem(key, v); } catch {}
}

function clearEverywhere(keys: string[]) {
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch {}
    try { sessionStorage.removeItem(k); } catch {}
  }
}

export default function DigigoStartButton({
  invoiceId,
  backUrl,
  environment,
}: {
  invoiceId: string;
  backUrl?: string;
  environment?: "test" | "production";
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setErr("");
    setLoading(true);

    clearEverywhere(["digigo_invoice_id", "digigo_state", "digigo_back_url"]);

    const safeBack = s(backUrl) || `/invoices/${encodeURIComponent(invoiceId)}`;

    try {
      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          invoice_id: invoiceId,
          environment: environment || undefined,
        }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok) {
        setErr(s(j?.message || j?.error || "Impossible de démarrer DigiGo."));
        return;
      }

      const authorizeUrl = s(j?.authorize_url);
      const state = s(j?.state || "");

      if (!authorizeUrl) {
        setErr("authorize_url manquant.");
        return;
      }

      // ✅ LE POINT CRITIQUE (sans ça => invoice_id manquant au retour)
      setEverywhere("digigo_invoice_id", invoiceId);
      if (state) setEverywhere("digigo_state", state);
      setEverywhere("digigo_back_url", safeBack);

      // ✅ rester dans la même fenêtre
      window.location.href = authorizeUrl;
    } catch (e: any) {
      setErr(s(e?.message || "Erreur réseau."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        onClick={start}
        disabled={loading}
      >
        {loading ? "Redirection…" : "Signer avec DigiGo"}
      </button>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}
    </div>
  );
}
