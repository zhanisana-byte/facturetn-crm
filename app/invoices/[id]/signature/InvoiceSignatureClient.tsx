"use client";

import { useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

function stringify(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

type Props = {
  invoiceId: string;
  backUrl?: string;
};

export default function InvoiceSignatureClient({ invoiceId, backUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  function setEverywhere(key: string, value: string) {
    const v = s(value);
    if (!v) return;
    try {
      window.localStorage.setItem(key, v);
    } catch {}
    try {
      window.sessionStorage.setItem(key, v);
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

  function formatApiError(j: any) {
    const msg =
      s(j?.message) ||
      s(j?.details?.message) ||
      stringify(j?.details) ||
      s(j?.error_description) ||
      "";

    const code = s(j?.error);

    if (msg && code && msg !== code) return msg;
    if (msg) return msg;
    if (code) return code;

    return "Impossible de démarrer DigiGo.";
  }

  async function start() {
    if (loading) return;

    setErr("");
    setLoading(true);

    const inv = s(invoiceId);
    if (!inv) {
      setErr("ID facture manquant.");
      setLoading(false);
      return;
    }

    const safeBackUrl = s(backUrl) || `/invoices/${encodeURIComponent(inv)}`;

    clearEverywhere(["digigo_state", "digigo_invoice_id", "digigo_back_url"]);

    try {
      const r = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: inv, back_url: safeBackUrl }),
        cache: "no-store",
        credentials: "include",
      });

      const j = await r.json().catch(() => ({}));

      if (!r.ok || !j?.ok || !j?.authorize_url) {
        setErr(formatApiError(j));
        return;
      }

      const state = s(j?.state || "");
      if (!state) {
        setErr("State manquant.");
        return;
      }

      setEverywhere("digigo_invoice_id", inv);
      setEverywhere("digigo_state", state);
      setEverywhere("digigo_back_url", safeBackUrl);

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
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 break-words">
          {err}
        </div>
      ) : null}
    </div>
  );
}
