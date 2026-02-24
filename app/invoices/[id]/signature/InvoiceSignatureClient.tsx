"use client";

import { useCallback, useState } from "react";

function s(v: any) {
  return String(v ?? "").trim();
}

function store(k: string, v: string) {
  const val = s(v);
  if (!val) return;
  try { window.localStorage.setItem(k, val); } catch {}
  try { window.sessionStorage.setItem(k, val); } catch {}
}

type Props = {
  invoiceId: string;
  backUrl?: string;
};

export default function InvoiceSignatureClient({ invoiceId, backUrl }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onStart = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const safeBackUrl = backUrl ?? `/invoices/${encodeURIComponent(invoiceId)}`;

      const res = await fetch("/api/digigo/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId, back_url: safeBackUrl }),
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        setError(String(data?.error || "START_FAILED"));
        return;
      }

      const authorizeUrl = s(data?.authorize_url);
      const state = s(data?.state);
      const inv = s(data?.invoice_id || invoiceId);
      const back = s(data?.back_url || safeBackUrl);

      if (!authorizeUrl) {
        setError("MISSING_AUTHORIZE_URL");
        return;
      }

      store("digigo_state", state);
      store("digigo_invoice_id", inv);
      store("digigo_back_url", back);

      window.location.href = authorizeUrl;
    } catch (e: any) {
      setError(String(e?.message || "NETWORK_ERROR"));
    } finally {
      setLoading(false);
    }
  }, [invoiceId, backUrl]);

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onStart}
        disabled={loading}
        className="w-full rounded-full bg-black px-6 py-4 text-white shadow-sm transition disabled:opacity-60"
      >
        {loading ? "Chargement..." : "Signer avec DigiGo"}
      </button>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
