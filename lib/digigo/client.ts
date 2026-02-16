export const runtime = "nodejs";

function env(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

export function digigoBaseUrl() {
  return env("DIGIGO_BASE_URL", "https://193.95.63.230").replace(/\/$/, "");
}

export function digigoProxyBaseUrl() {
  return `${digigoBaseUrl()}/tunsign-proxy-webapp`;
}

export function digigoClientId() {
  return env("DIGIGO_CLIENT_ID");
}

export function digigoClientSecret() {
  return env("DIGIGO_CLIENT_SECRET");
}

export function digigoRedirectUri() {
  const forced = env("DIGIGO_REDIRECT_URI_FORCE");
  if (forced) return forced;

  const configured = env("DIGIGO_REDIRECT_URI");
  if (configured) return configured;

  return "https://facturetn-crm-iota.vercel.app/digigo/redirect";
}

export function digigoAuthorizeUrl(args: {
  state: string;
  hash: string;
  credentialId?: string;
  numSignatures?: number;
}) {
  const clientId = digigoClientId();
  const redirectUri = digigoRedirectUri();

  if (!clientId) throw new Error("DIGIGO_CLIENT_ID_MISSING");
  if (!redirectUri) throw new Error("DIGIGO_REDIRECT_URI_MISSING");
  if (!args?.state) throw new Error("STATE_MISSING");
  if (!args?.hash) throw new Error("HASH_MISSING");

  const u = new URL(`${digigoProxyBaseUrl()}/oauth2/authorize`);

  u.searchParams.set("redirectUri", redirectUri);
  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("numSignatures", String(args.numSignatures ?? 1));
  u.searchParams.set("hash", String(args.hash));
  u.searchParams.set("state", String(args.state));

  if (args.credentialId) {
    u.searchParams.set("credentialId", String(args.credentialId));
  }

  return u.toString();
}

function decodeJwtPayload(token: string): any {
  const t = String(token || "").trim();
  const parts = t.split(".");
  if (parts.length < 2) return null;

  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const json = Buffer.from(b64 + pad, "base64").toString("utf8");
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function jwtGetJti(token: string) {
  const p = decodeJwtPayload(token);
  return String(p?.jti ?? "").trim();
}

export async function digigoOauthToken(args: { code: string }) {
  const code = String(args?.code ?? "").trim();
  if (!code) return { ok: false as const, error: "CODE_MISSING" };

  const clientId = digigoClientId();
  const clientSecret = digigoClientSecret();
  const redirectUri = digigoRedirectUri();
  const grantType = env("DIGIGO_GRANT_TYPE", "authorization_code");

  if (!clientId) return { ok: false as const, error: "DIGIGO_CLIENT_ID_MISSING" };
  if (!clientSecret) return { ok: false as const, error: "DIGIGO_CLIENT_SECRET_MISSING" };
  if (!redirectUri) return { ok: false as const, error: "DIGIGO_REDIRECT_URI_MISSING" };

  const form = new URLSearchParams();
  form.set("grant_type", grantType);
  form.set("code", code);
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("redirect_uri", redirectUri);

  const res = await fetch(`${digigoProxyBaseUrl()}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    cache: "no-store",
  });

  const txt = await res.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }

  if (!res.ok) {
    return { ok: false as const, error: String(j?.error || j?.message || txt || `HTTP_${res.status}`) };
  }

  return { ok: true as const, ...j };
}

export async function digigoSignHash(args: {
  token: string;
  credentialId: string;
  sad: string;
  hashes: string[];
}) {
  const token = String(args?.token ?? "").trim();
  const credentialId = String(args?.credentialId ?? "").trim();
  const sad = String(args?.sad ?? "").trim();
  const hashes = Array.isArray(args?.hashes) ? args.hashes.map((h) => String(h || "").trim()).filter(Boolean) : [];

  if (!token) return { ok: false as const, error: "TOKEN_MISSING" };
  if (!credentialId) return { ok: false as const, error: "CREDENTIAL_ID_MISSING" };
  if (!sad) return { ok: false as const, error: "SAD_MISSING" };
  if (!hashes.length) return { ok: false as const, error: "HASHES_MISSING" };

  const res = await fetch(`${digigoProxyBaseUrl()}/rest/signHash`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      credentialId,
      sad,
      hashes,
    }),
    cache: "no-store",
  });

  const txt = await res.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }

  if (!res.ok) {
    return { ok: false as const, error: String(j?.error || j?.message || txt || `HTTP_${res.status}`) };
  }

  const value =
    String(j?.signatures?.[0] || j?.signature || j?.value || "").trim();

  return { ok: true as const, value, raw: j };
}
