"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function DigigoRootRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const code = params.get("code");
    const error = params.get("error");

    const qs = new URLSearchParams(params.toString());

    if (!qs.get("state")) {
      const st = typeof window !== "undefined" ? window.sessionStorage.getItem("digigo_state") : "";
      if (st) qs.set("state", st);
    }

    if (token || (qs.get("state") && code) || error) {
      try {
        window.sessionStorage.removeItem("digigo_state");
      } catch {}
      router.replace("/digigo/redirect?" + qs.toString());
    }
  }, [params, router]);

  return null;
}
