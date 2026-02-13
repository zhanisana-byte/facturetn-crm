import https from "https";

function s(v: any) {
  return String(v ?? "").trim();
}

function base64UrlDecodeToString(b64url: string) {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

export function jwtGetJti(token: string): string {
  const t = s(token);
  const parts = t.split(".");
  if (parts.length < 2) return "";
  try {
    const payload = JSON.parse(base64UrlDecodeToString(parts[1]));
    return s(payload?.jti || payload?.JTI || "");
  } catch {
    return "";
  }
}

function env(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function digigoBaseUrl() {
  return env("DIGIGO_BASE_URL").replace(/\/$/, "");
}

function digigoProxyBaseUrl() {
  return `${digigoBaseUrl()}/tunsign-proxy-webapp`;
}

function digigoClientId() {
  return env("DIGIGO_CLIENT_ID");
}

function digigoClientSecret() {
  return env("DIGIGO_CLIENT_SECRET");
}

function digigoRedirectUri() {
  return env("DIGIGO_REDIRECT_URI");
}

function digigoAllowInsecure() {
  return env("DIGIGO_ALLOW_INSECURE", "true").toLowerCase() === "true";
}

async function digigoFetchJson(url: string, init: RequestInit) {
  const agent = digigoAllowInsecure() ? new https.Agent({ rejectUnauthorized: false }) : undefined;
  const reqInit: any = { ...init };
  if (agent) reqInit.agent = agent;

  const res = await fetch(url, reqInit);
  const txt = await res.text();
  let data: any = txt;
  try {
    data = JSON.parse(txt);
  } catch {}
  return { ok: res.ok, status: res.status, data };
}

export async function digigoOauthToken(args: { credentialId: string; code: string; redirectUri?: string }) {
  const base = digigoProxyBaseUrl();
  const clientId = digigoClientId();
  const clientSecret = digigoClientSecret();
  const redirectUri = s(args.redirectUri || digigoRedirectUri());

  const credentialId = s(args.credentialId);
  const code = s(args.code);

  if (!base) return { ok: false, status: 0, error: "DIGIGO_BASE_URL_MISSING" };
  if (!clientId) return { ok: false, status: 0, error: "DIGIGO_CLIENT_ID_MISSING" };
  if (!clientSecret) return { ok: false, status: 0, error: "DIGIGO_CLIENT_SECRET_MISSING" };
  if (!redirectUri) return { ok: false, status: 0, error: "DIGIGO_REDIRECT_URI_MISSING" };
  if (!credentialId) return { ok: false, status: 0, error: "CREDENTIAL_ID_MISSING" };
  if (!code) return { ok: false, status: 0, error: "CODE_MISSING" };

  const grantType = "authorization_code";

  const url =
    `${base}/services/v1/oauth2/token/` +
    `${encodeURIComponent(clientId)}/` +
    `${encodeURIComponent(grantType)}/` +
    `${encodeURIComponent(clientSecret)}/` +
    `${encodeURIComponent(code)}`;

  const r = await digigoFetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUri }),
  });

  if (!r.ok) {
    const err = s((r.data as any)?.error || (r.data as any)?.message || `HTTP_${r.status}`);
    return { ok: false, status: r.status, error: err, data: r.data };
  }

  const sad = s((r.data as any)?.sad || (r.data as any)?.SAD || "");
  if (!sad) return { ok: false, status: r.status, error: "SAD_MISSING", data: r.data };

  return { ok: true, status: r.status, sad };
}

export async function digigoSignHash(args: { credentialId: string; sad: string; hashes: string[] }) {
  const base = digigoProxyBaseUrl();
  const clientId = digigoClientId();

  const credentialId = s(args.credentialId);
  const sad = s(args.sad);

  if (!base) return { ok: false, status: 0, error: "DIGIGO_BASE_URL_MISSING" };
  if (!clientId) return { ok: false, status: 0, error: "DIGIGO_CLIENT_ID_MISSING" };
  if (!credentialId) return { ok: false, status: 0, error: "CREDENTIAL_ID_MISSING" };
  if (!sad) return { ok: false, status: 0, error: "SAD_MISSING" };

  const hashes = Array.isArray(args.hashes) ? args.hashes.map(s).filter(Boolean) : [];
  if (!hashes.length) return { ok: false, status: 0, error: "HASHES_MISSING" };

  const hashAlgo = "SHA256";
  const signAlgo = "RSA";

  const url =
    `${base}/services/v1/signatures/signHash/` +
    `${encodeURIComponent(clientId)}/` +
    `${encodeURIComponent(credentialId)}/` +
    `${encodeURIComponent(sad)}/` +
    `${encodeURIComponent(hashAlgo)}/` +
    `${encodeURIComponent(signAlgo)}`;

  const r = await digigoFetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hashes),
  });

  if (!r.ok) {
    const err = s((r.data as any)?.error || (r.data as any)?.message || `HTTP_${r.status}`);
    return { ok: false, status: r.status, error: err, data: r.data };
  }

  const first = Array.isArray(r.data) ? r.data[0] : r.data;
  const value = s(first?.value || "");
  const algorithm = s(first?.algorithm || "");

  if (!value) return { ok: false, status: r.status, error: "SIGNATURE_VALUE_MISSING", data: r.data };

  return { ok: true, status: r.status, value, algorithm };
}
