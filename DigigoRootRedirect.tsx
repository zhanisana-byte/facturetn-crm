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

    // Si on a ni token ni code ni error, rien ne se passe
    if (!token && !code && !error) return;

    // Récupère les paramètres d'URL
    const qs = new URLSearchParams(params.toString());

    // Vérifie et récupère le state
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

    // Vérifie et récupère l'ID de la facture
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

    // Redirige vers la page de signature si tout est correct
    if (state && invoiceId) {
      router.replace("/digigo/redirect?" + qs.toString());
    } else {
      // Si l'un des paramètres est manquant, redirige vers la page de connexion
      router.replace("/login");
    }
  }, [params, router]);

  return null;
}
