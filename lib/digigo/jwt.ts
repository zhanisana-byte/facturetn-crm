// lib/digigo/jwt.ts
function b64urlToJson(part: string) {
  const s = part.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const json = Buffer.from(s + pad, "base64").toString("utf8");
  return JSON.parse(json);
}

export function decodeJwtPayload(token: string): any {
  const t = String(token || "").trim();
  const parts = t.split(".");
  if (parts.length < 2) return {};
  return b64urlToJson(parts[1]);
}
