"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
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

    const qs = new URLSearchParams();

    for (const [k, v] of params.entries()) {
      qs.set(k, v);
    }

    router.replace("/digigo/redirect?" + qs.toString());
  }, [params, router]);

  return null;
}
