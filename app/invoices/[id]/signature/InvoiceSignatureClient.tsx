"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  invoiceId: string;
};

export default function InvoiceSignatureClient({ invoiceId }: Props) {
  const router = useRouter();
  const [provider, setProvider] = useState<"digigo" | "agent" | "none">("digigo");
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sign() {
    setError(null);
    setInfo(null);

    if (provider === "none") {
      router.push(`/invoices/${invoiceId}`);
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/signature/${provider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoice_id: invoiceId }),
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || "Erreur signature");
        }

        setInfo("Signature lancée avec succès");

        // après signature → résumé
        router.push(`/invoices/${invoiceId}`);
      } catch (e: any) {
        setError(e.message || "Erreur signature");
      }
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="ftn-card p-6">
        <div className="text-lg font-semibold mb-2">Choisir le mode de signature</div>

        <select
          className="ftn-input w-full max-w-md"
          value={provider}
          onChange={(e) => setProvider(e.target.value as any)}
        >
          <option value="digigo">SMS (DigiGO)</option>
          <option value="agent">Clé USB (agent local)</option>
          <option value="none">Sans signature</option>
        </select>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {info && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {info}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            className="ftn-btn"
            onClick={sign}
            disabled={loading}
          >
            {loading ? "Signature..." : "Signer & continuer"}
          </button>

          <button
            className="ftn-btn ftn-btn-ghost"
            onClick={() => router.push(`/invoices/${invoiceId}`)}
          >
            Passer au résumé
          </button>
        </div>
      </div>
    </div>
  );
}
