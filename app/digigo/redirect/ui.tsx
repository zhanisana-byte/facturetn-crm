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
  const code = useMemo(() => s(sp.get("code") || ""), [sp]);
  const state = useMemo(() => s(sp.get("state") || ""), [sp]);

  const invoice_id = useMemo(() => s(sp.get("invoice_id") || ""), [sp]);
  const back_url = useMemo(() => s(sp.get("back") || ""), [sp]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<{ title: string; details?: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        if (!token && !code) throw new Error("MISSING_TOKEN_OR_CODE");

        const r = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code, state, invoice_id, back_url }),
          cache: "no-store",
          credentials: "include",
        });

        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) throw new Error(s(j?.details || j?.error || `HTTP_${r.status}`));

        const redirect = s(j?.redirect || "/");
        if (mounted) router.replace(redirect);
      } catch (e: any) {
        const d = s(e?.message || e || "");
        if (mounted) {
          setErr({ title: "Erreur serveur.", details: d });
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [token, code, state, invoice_id, back_url, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
        <div className="text-xl font-semibold text-slate-900">Finalisation de la signature</div>

        {loading ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            Traitement en cours…
          </div>
        ) : null}

        {err ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
            <div className="font-semibold">{err.title}</div>
            {err.details ? <div className="mt-2 text-sm break-words">{err.details}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
