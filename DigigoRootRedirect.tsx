"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    const token = params.get("token");
    const code = params.get("code");
    const error = params.get("error");

    const qs = new URLSearchParams(params.toString());

    if (!qs.get("state")) {
      const st = typeof window !== "undefined" ? getStored("digigo_state") : "";
      if (st) qs.set("state", st);
    }

    if (!qs.get("invoice_id")) {
      const inv = typeof window !== "undefined" ? getStored("digigo_invoice_id") : "";
      if (inv) qs.set("invoice_id", inv);
    }

    if (token || code || error) {
      router.replace("/digigo/redirect?" + qs.toString());
    }
  }, [params, router]);

  return null;
}
