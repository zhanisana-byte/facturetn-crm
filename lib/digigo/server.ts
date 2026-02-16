// lib/digigo/server.ts
import crypto from "crypto";

type DigigoEnv = "test" | "production";

function s(v: any) {
  return String(v ?? "").trim();
}

function pickEnv(explicit?: any): DigigoEnv {
  const e = s(explicit).toLowerCase();
  if (e === "production" || e === "prod") return "production";
  return "test";
}

function baseUrl(env?: DigigoEnv) {
  const e = env ?? pickEnv(process.env.DIGIGO_ENV);
  const prod =
    s(process.env.DIGIGO_PROD_BASE_URL) ||
    s(process.env.DIGIGO_BASE_URL_PROD) ||
    s(process.env.DIGIGO_BASE_URL);
  const test =
    s(process.env.DIGIGO_TEST_BASE_URL) ||
    s(process.env.DIGIGO_BASE_URL_TEST) ||
    s(process.env.DIGIGO_BASE_URL);
  return (e === "production" ? prod : test) || "";
}

function clientId() {
  return (
    s(process.env.DIGIGO_CLIENT_ID) ||
    s(process.env.NEXT_PUBLIC_DIGIGO_CLIENT_ID) ||
    ""
  );
}

function clientSecret() {
  return s(process.env.DIGIGO_CLIENT_SECRET) || "";
}

function redirectUri() {
  return (
    s(process.env.DIGIGO_REDIRECT_URI) ||
    s(process.env.NEXT_PUBLIC_DIGIGO_REDIRECT_URI) ||
    s(process.env.NEXT_PUBLIC_BASE_URL) ||
    ""
  );
}

function scope() {
  return s(process.env.DIGIGO_SCOPE) || "sign";
}

function grantType() {
  return s(process.env.DIGIGO_GRANT_TYPE) || "authorization_code";
}

function ensure(v: string, name: string) {
  if (!v) throw new Error(`${name}_MISSING`);
  return v;
}

function q(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    usp.set(k, String(v));
  }
  return usp.toString();
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
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

export function digigoAuthorizeUrl(args: {
  state: string;
  hash: string;
  credentialId: string;
  numSignatures?: number;
  environment?: DigigoEnv;
}) {
  const env = args.environment ?? pickEnv(process.env.DIGIGO_ENV);
  const b = ensure(baseUrl(env), "DIGIGO_BASE_URL");
  const cid = ensure(clientId(), "DIGIGO_CLIENT_ID");
  const ru = ensure(redirectUri(), "DIGIGO_REDIRECT_URI");

  const url = new URL("/oauth2/authorize", b);
  url.search = q({
    response_type: "code",
    client_id: cid,
    redirect_uri: ru,
    scope: scope(),
    state: args.state,
    hash: args.hash,
    credentialId: args.credentialId,
    numSignatures: args.numSignatures ?? 1,
  });

  return url.toString();
}

export async function digigoOauthToken(params: {
  credentialId: string;
  code: string;
  environment?: DigigoEnv;
}) {
  const env = params.environment ?? pickEnv(process.env.DIGIGO_ENV);
  const b = ensure(baseUrl(env), "DIGIGO_BASE_URL");
  const cid = ensure(clientId(), "DIGIGO_CLIENT_ID");
  const secret = ensure(clientSecret(), "DIGIGO_CLIENT_SECRET");
  const gt = grantType();
  const code = ensure(s(params.code), "CODE");

  const url = new URL(
    `/oauth2/token/${encodeURIComponent(cid)}/${encodeURIComponent(gt)}/${encodeURIComponent(secret)}/${encodeURIComponent(code)}`,
    b
  );

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    return { ok: false as const, error: json?.message || json?.error || text || `HTTP_${res.status}` };
  }

  const sad = s(json?.sad || json?.SAD || json?.access_token || "");
  if (!sad) return { ok: false as const, error: "SAD_MISSING" };

  return { ok: true as const, sad, raw: json };
}

export async function digigoSignHash(params: {
  credentialId: string;
  sad: string;
  hashes: string[];
  environment?: DigigoEnv;
}) {
  const env = params.environment ?? pickEnv(process.env.DIGIGO_ENV);
  const b = ensure(baseUrl(env), "DIGIGO_BASE_URL");
  const cid = ensure(clientId(), "DIGIGO_CLIENT_ID");

  const credentialId = ensure(s(params.credentialId), "CREDENTIAL_ID");
  const sad = ensure(s(params.sad), "SAD");
  const hashes = Array.isArray(params.hashes) ? params.hashes.map(s).filter(Boolean) : [];

  if (!hashes.length) return { ok: false as const, error: "HASHES_MISSING" };

  const url = new URL(
    `/signHash/${encodeURIComponent(cid)}/${encodeURIComponent(credentialId)}/${encodeURIComponent(sad)}`,
    b
  );

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ hashes }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    return { ok: false as const, error: json?.message || json?.error || text || `HTTP_${res.status}` };
  }

  const value =
    s(json?.value) ||
    s(json?.signature) ||
    s(Array.isArray(json?.signatures) ? json.signatures?.[0] : "") ||
    s(Array.isArray(json?.values) ? json.values?.[0] : "");

  const algorithm = s(json?.algorithm || json?.alg || "");

  if (!value) return { ok: false as const, error: "SIGNATURE_VALUE_MISSING" };

  return { ok: true as const, value, algorithm, raw: json };
}
