"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function DigigoSignButton({ invoiceId }: { invoiceId: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    setErr("");
    setLoading(true);
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
      if (state) {
        try {
          window.sessionStorage.setItem("digigo_state", state);
        } catch {}
      }

      window.location.href = String(j.authorize_url);
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
