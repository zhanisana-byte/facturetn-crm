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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

    if (!token && !code && !error) return;

    const qs = new URLSearchParams(params.toString());

    let state = s(qs.get("state") || "");
    if (!isUuid(state)) {
      const st = getStored("digigo_state");
      if (isUuid(st)) {
        state = st;
        qs.set("state", st);
      } else {
        qs.delete("state");
      }
    }

    let invoiceId = s(qs.get("invoice_id") || "");
    if (!isUuid(invoiceId)) {
      const inv = getStored("digigo_invoice_id");
      if (isUuid(inv)) {
        invoiceId = inv;
        qs.set("invoice_id", inv);
      } else {
        qs.delete("invoice_id");
      }
    }

    const back = s(qs.get("back") || "");
    if (!back) {
      const b = getStored("digigo_back_url");
      if (b) qs.set("back", b);
    }

    router.replace("/digigo/redirect?" + qs.toString());
  }, [params, router]);

  return null;
}
