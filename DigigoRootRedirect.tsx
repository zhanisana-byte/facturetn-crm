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
    const state = s(params.get("state") || "");
    const invoiceId = s(params.get("invoice_id") || "");

    if (!token && !code && !error) return;

    const qs = new URLSearchParams(params.toString());

    if (!state) {
      const st = typeof window !== "undefined" ? getStored("digigo_state") : "";
      if (st) qs.set("state", st);
    }

    if (!invoiceId) {
      const inv = typeof window !== "undefined" ? getStored("digigo_invoice_id") : "";
      if (inv) qs.set("invoice_id", inv);
    }

    router.replace("/digigo/redirect?" + qs.toString());
  }, [params, router]);

  return null;
}
