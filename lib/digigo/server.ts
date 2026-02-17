// lib/digigo/server.ts
import crypto from "crypto";

export type DigigoEnv = "production" | "test";

function s(v: any) {
  return String(v ?? "").trim();
}

function must(v: any, name: string) {
  const t = s(v);
  if (!t) throw new Error(name);
  return t;
}

export function digigoBaseUrl() {
  return must(process.env.DIGIGO_BASE_URL || "https://193.95.63.230", "DIGIGO_BASE_URL_MISSING");
}

export function digigoClientId() {
  return must(process.env.DIGIGO_CLIENT_ID, "DIGIGO_CLIENT_ID_MISSING");
}

export function digigoRedirectUri() {
  return must(process.env.DIGIGO_REDIRECT_URI, "DIGIGO_REDIRECT_URI_MISSING");
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function digigoAuthorizeUrl(args: {
  state: string;
  hash: string;
  credentialId: string;
  numSignatures?: number;
}) {
  const base = digigoBaseUrl();
  const proxyBase = `${base}/tunsign-proxy-webapp`;
  const clientId = digigoClientId();
  const redirectUri = digigoRedirectUri();

  const state = must(args?.state, "STATE_MISSING");
  const hash = must(args?.hash, "HASH_MISSING");
  const credentialId = must(args?.credentialId, "CREDENTIAL_ID_MISSING");
  const numSignatures = String(args?.numSignatures ?? 1);

  const u = new URL(`${proxyBase}/oauth2/authorize`);
  u.searchParams.set("redirectUri", redirectUri);
  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("credentialId", credentialId);
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("numSignatures", numSignatures);
  u.searchParams.set("hash", hash);
  u.searchParams.set("state", state);
  return u.toString();
}

export async function digigoOauthToken(args: { code: string }) {
  const base = digigoBaseUrl();
  const clientId = digigoClientId();
  const redirectUri = digigoRedirectUri();
  const code = s(args?.code);
  if (!code) return { ok: false as const, error: "CODE_MISSING" };

  const u = new URL(`${base}/tunsign-proxy-webapp/oauth2/token`);
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("redirectUri", redirectUri);
  u.searchParams.set("grantType", "authorization_code");
  u.searchParams.set("code", code);

  const r = await fetch(u.toString(), { method: "POST", cache: "no-store" });
  const t = await r.text().catch(() => "");
  if (!r.ok) return { ok: false as const, error: t || `HTTP_${r.status}` };

  let j: any = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = {};
  }

  const sad = s(j?.sad || j?.SAD || j?.access_token || j?.token);
  if (!sad) return { ok: false as const, error: "SAD_MISSING" };

  return { ok: true as const, sad };
}

export async function digigoSignHash(args: { credentialId: string; sad: string; hashes: string[] }) {
  const base = digigoBaseUrl();
  const credentialId = s(args?.credentialId);
  const sad = s(args?.sad);
  const hashes = Array.isArray(args?.hashes) ? args.hashes.map(s).filter(Boolean) : [];

  if (!credentialId) return { ok: false as const, error: "CREDENTIAL_ID_MISSING" };
  if (!sad) return { ok: false as const, error: "SAD_MISSING" };
  if (!hashes.length) return { ok: false as const, error: "HASHES_MISSING" };

  const url = `${base}/tunsign-proxy-webapp/signHash`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      credentialId,
      sad,
      hashes,
      hashAlgorithm: "SHA256",
      signatureFormat: "XAdES",
      conformanceLevel: "XAdES_BASELINE_B",
    }),
    cache: "no-store",
  });

  const t = await r.text().catch(() => "");
  if (!r.ok) return { ok: false as const, error: t || `HTTP_${r.status}` };

  let j: any = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = {};
  }

  const value = s(j?.signatures?.[0] || j?.signature || j?.value);
  if (!value) return { ok: false as const, error: "SIGNATURE_EMPTY" };

  return { ok: true as const, value };
}
