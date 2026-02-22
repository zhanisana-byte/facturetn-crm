// lib/digigo/ids.ts
import crypto from "crypto";

export function uuid() {
  return crypto.randomUUID();
}

export function s(v: any) {
  return String(v ?? "").trim();
}
