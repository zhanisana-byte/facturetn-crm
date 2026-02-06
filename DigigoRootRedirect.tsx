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
      // IMPORTANT: NE PAS effacer le state ici.
      // /digigo/redirect en a besoin pour valider le retour,
      // puis /digigo/redirect le supprimera après succès.
      router.replace("/digigo/redirect?" + qs.toString());
    }
  }, [params, router]);

  return null;
}
