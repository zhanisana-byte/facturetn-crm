"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
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

function extractInvoiceIdFromState(state: string) {
  const st = s(state);
  if (!st) return "";
  const m = st.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i
  );
  return m ? m[1] : "";
}

export default function DigigoRootRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const token = s(params.get("token") || "");
    const code = s(params.get("code") || "");
    const error = s(params.get("error") || "");
    const stateFromUrl = s(params.get("state") || "");
    const invoiceIdFromUrl = s(params.get("invoice_id") || "");

    if (!token && !code && !error) return;

    const qs = new URLSearchParams(params.toString());

    // 1) state : URL d'abord, sinon storage
    let state = stateFromUrl;
    if (!state) {
      const st = typeof window !== "undefined" ? getStored("digigo_state") : "";
      if (st) {
        state = st;
        qs.set("state", st);
      }
    }

    // 2) invoice_id : URL d'abord, sinon storage, sinon parse depuis state (IMPORTANT)
    let invoiceId = invoiceIdFromUrl;
    if (!invoiceId) {
      const inv = typeof window !== "undefined" ? getStored("digigo_invoice_id") : "";
      if (inv) {
        invoiceId = inv;
        qs.set("invoice_id", inv);
      }
    }
    if (!invoiceId && state) {
      const invFromState = extractInvoiceIdFromState(state);
      if (invFromState) qs.set("invoice_id", invFromState);
    }

    router.replace("/digigo/redirect?" + qs.toString());
  }, [params, router]);

  return null;
}
