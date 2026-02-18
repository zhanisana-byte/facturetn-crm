// app/digigo/redirect/ui.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

export default function DigigoRedirectClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const token = useMemo(() => s(sp.get("token") || ""), [sp]);
  const state = useMemo(() => s(sp.get("state") || ""), [sp]);
  const invoice_id = useMemo(() => s(sp.get("invoice_id") || ""), [sp]);
  const back_url = useMemo(() => s(sp.get("back") || ""), [sp]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        if (!token) throw new Error("MISSING_TOKEN");

        const confirmRes = await fetch("/api/digigo/confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token,
            state: state || undefined,
            invoice_id: invoice_id || undefined,
          }),
          cache: "no-store",
          credentials: "include",
        });

        const confirmTxt = await confirmRes.text().catch(() => "");
        let confirmJson: any = null;
        try {
          confirmJson = confirmTxt ? JSON.parse(confirmTxt) : null;
        } catch {
          confirmJson = null;
        }

        if (!confirmRes.ok || !confirmJson?.ok) {
          const details = s(
            confirmJson?.message ||
              confirmJson?.details ||
              confirmJson?.error ||
              confirmTxt ||
              `HTTP_${confirmRes.status}`
          );
          throw new Error(`${confirmRes.status} ${details}`);
        }

        const cbRes = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, state: state || undefined }),
          cache: "no-store",
          credentials: "include",
        });

        const cbTxt = await cbRes.text().catch(() => "");
        let cbJson: any = null;
        try {
          cbJson = cbTxt ? JSON.parse(cbTxt) : null;
        } catch {
          cbJson = null;
        }

        if (!cbRes.ok || !cbJson?.ok) {
          const details = s(cbJson?.details || cbJson?.error || cbTxt || `HTTP_${cbRes.status}`);
          throw new Error(`${cbRes.status} ${details}`);
        }

        const redirect = s(
          cbJson?.redirect ||
            back_url ||
            (invoice_id ? `/invoices/${invoice_id}` : "/accountant/invoices")
        );

        if (mounted) router.replace(redirect);
      } catch (e: any) {
        if (mounted) {
          setErr(s(e?.message || e || "Erreur"));
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [token, state, invoice_id, back_url, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="text-xl font-semibold text-slate-900">Finalisation de la signature</div>

        {loading ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            Traitement en cours…
          </div>
        ) : null}

        {!loading && err ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
            <div className="font-semibold">Erreur</div>
            <div className="mt-2 text-sm break-words whitespace-pre-wrap">{err}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
