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
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        if (!token && !code) throw new Error("MISSING_TOKEN_OR_CODE");
        if (!state) throw new Error("MISSING_STATE");
        if (!invoice_id) throw new Error("MISSING_INVOICE_ID");

        if (token) {
          const c = await fetch("/api/signature/digigo/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ token, state, invoice_id }),
            cache: "no-store",
            credentials: "include",
          });

          const ct = await c.text().catch(() => "");
          let cj: any = null;
          try {
            cj = ct ? JSON.parse(ct) : null;
          } catch {
            cj = null;
          }

          if (!c.ok || !cj?.ok) {
            const details = s(cj?.details || cj?.error || ct || `HTTP_${c.status}`);
            throw new Error(`${c.status} ${details}`);
          }
        }

        const r = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, code, state, invoice_id, back_url }),
          cache: "no-store",
          credentials: "include",
        });

        const txt = await r.text().catch(() => "");
        let j: any = null;
        try {
          j = txt ? JSON.parse(txt) : null;
        } catch {
          j = null;
        }

        if (!r.ok || !j?.ok) {
          const details = s(j?.details || j?.error || txt || `HTTP_${r.status}`);
          throw new Error(`${r.status} ${details}`);
        }

        const redirect = s(j?.redirect || "/");
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
