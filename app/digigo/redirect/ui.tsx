"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function getStored(key: string) {
  let v = "";
  try {
    v = s(window.localStorage.getItem(key) || "");
  } catch {}
  if (v) return v;
  try {
    v = s(window.sessionStorage.getItem(key) || "");
  } catch {}
  return v;
}

export default function RedirectUi() {
  const router = useRouter();
  const params = useSearchParams();

  const token = useMemo(() => s(params.get("token") || ""), [params]);
  const code = useMemo(() => s(params.get("code") || ""), [params]);
  const stateFromUrl = useMemo(() => s(params.get("state") || ""), [params]);

  const state = useMemo(() => {
    if (isUuid(stateFromUrl)) return stateFromUrl;
    const st = getStored("digigo_state");
    return isUuid(st) ? st : "";
  }, [stateFromUrl]);

  const invoice_id = useMemo(() => {
    const inv = getStored("digigo_invoice_id");
    return isUuid(inv) ? inv : "";
  }, []);

  const back_url = useMemo(() => s(getStored("digigo_back_url") || ""), []);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        if (!token && !code) throw new Error("MISSING_TOKEN_OR_CODE");
        if (!invoice_id) throw new Error("MISSING_INVOICE_ID");

        const r = await fetch("/api/digigo/callback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          cache: "no-store",
          body: JSON.stringify({ token, code, state, invoice_id, back_url }),
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) throw new Error(s(j?.error || j?.details || `HTTP_${r.status}`));

        const redirect = s(j?.redirect || back_url || `/invoices/${invoice_id}`);
        if (mounted) router.replace(redirect);
      } catch (e: any) {
        if (mounted) {
          setErr(s(e?.message || e));
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
        <div className="text-xl font-semibold text-slate-900">Signature DigiGo</div>

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
