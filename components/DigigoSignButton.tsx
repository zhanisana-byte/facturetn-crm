"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function DigigoSignButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  function setEverywhere(key: string, value: string) {
    if (!value) return;

    try {
      window.localStorage.setItem(key, value);
    } catch {}

    try {
      window.sessionStorage.setItem(key, value);
    } catch {}
  }

  function clearEverywhere(keys: string[]) {
    for (const k of keys) {
      try {
        window.localStorage.removeItem(k);
      } catch {}
      try {
        window.sessionStorage.removeItem(k);
      } catch {}
    }
  }

  async function start() {
    setErr("");
    setLoading(true);

    clearEverywhere(["digigo_state", "digigo_invoice_id"]);

    try {
      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok || !j?.authorize_url) {
        setErr(s(j?.error || j?.message || "Impossible de démarrer DigiGo."));
        return;
      }

      const state = s(j?.state || "");
      setEverywhere("digigo_state", state);
      setEverywhere("digigo_invoice_id", invoiceId);

      window.location.href = String(j.authorize_url);
    } catch (e: any) {
      setErr(s(e?.message || "Erreur réseau."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button className="ftn-btn w-full sm:w-auto" type="button" onClick={start} disabled={loading}>
        {loading ? "Redirection…" : "Signer avec DigiGo"}
      </button>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{err}</div>
      ) : null}
    </div>
  );
}
