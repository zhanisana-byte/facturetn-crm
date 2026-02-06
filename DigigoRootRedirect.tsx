"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function s(v: any) {
  return String(v ?? "").trim();
}

function getStoredState() {
  let st = "";
  try {
    st = s(window.localStorage.getItem("digigo_state") || "");
  } catch {}
  if (st) return st;

  try {
    st = s(window.sessionStorage.getItem("digigo_state") || "");
  } catch {}
  return st;
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
      const st = typeof window !== "undefined" ? getStoredState() : "";
      if (st) qs.set("state", st);
    }

    if (token || (qs.get("state") && code) || error) {
      // IMPORTANT: ne pas effacer ici !
      // On laisse /digigo/redirect utiliser le state,
      // puis /digigo/redirect effacera après succès.
      router.replace("/digigo/redirect?" + qs.toString());
    }
  }, [params, router]);

  return null;
}
