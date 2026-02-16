import https from "https";
import crypto from "crypto";

export type DigigoEnv = "TEST" | "PROD";

function s(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function ensure(v: string, name: string) {
  if (!v) throw new Error(`${name}_MISSING`);
  return v;
}

function pickEnv(v?: string): DigigoEnv {
  return v === "PROD" ? "PROD" : "TEST";
}

function baseUrl(env: DigigoEnv) {
  if (env === "PROD") return ensure(process.env.DIGIGO_BASE_URL_PROD || "", "DIGIGO_BASE_URL_PROD");
  return ensure(process.env.DIGIGO_BASE_URL_TEST || "", "DIGIGO_BASE_URL_TEST");
}

function clientId() {
  return ensure(process.env.DIGIGO_CLIENT_ID || "", "DIGIGO_CLIENT_ID");
}

function clientSecret() {
  return ensure(process.env.DIGIGO_CLIENT_SECRET || "", "DIGIGO_CLIENT_SECRET");
}

function redirectUri() {
  return ensure(process.env.DIGIGO_REDIRECT_URI || "", "DIGIGO_REDIRECT_URI");
}

function b64urlToUtf8(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, "base64").toString("utf8");
}

export function jwtGetJti(jwt: string) {
  const t = s(jwt);
  const parts = t.split(".");
  if (parts.length < 2) return "";
  try {
    const payload = JSON.parse(b64urlToUtf8(parts[1]));
    return s(payload?.jti || "");
  } catch {
    return "";
  }
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(String(input ?? ""), "utf8").digest("base64");
}

async function fetchJson(url: string, init: RequestInit) {
  const allowInsecure = process.env.DIGIGO_INSECURE_TLS === "true";
  const agent = allowInsecure ? new https.Agent({ rejectUnauthorized: false }) : undefined;

  const res = await fetch(
    url,
    ({
      ...init,
      agent,
    } as any)
  );

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}

  return { res, text, json };
}

export async function digigoAuthorizeUrl(params: {
  credentialId: string;
  environment?: DigigoEnv;
  state: string;
}) {
  const env = params.environment ?? pickEnv(process.env.DIGIGO_ENV);
  const b = baseUrl(env);
  const cid = clientId();
  const ru = redirectUri();
  const credentialId = ensure(s(params.credentialId), "CREDENTIAL_ID");
  const state = ensure(s(params.state), "STATE");

  const url =
    `${b}/tunsign-proxy-webapp/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(cid)}` +
    `&redirect_uri=${encodeURIComponent(ru)}` +
    `&credentialID=${encodeURIComponent(credentialId)}` +
    `&state=${encodeURIComponent(state)}`;

  return url;
}

export async function digigoOauthToken(params: {
  credentialId?: string;
  code: string;
  environment?: DigigoEnv;
}) {
  const env = params.environment ?? pickEnv(process.env.DIGIGO_ENV);
  const b = baseUrl(env);
  const cid = clientId();
  const secret = clientSecret();
  const code = ensure(s(params.code), "CODE");
  const ru = redirectUri();

  const url =
    `${b}/tunsign-proxy-webapp/services/v1/oauth2/token/` +
    `${encodeURIComponent(cid)}/authorization_code/` +
    `${encodeURIComponent(secret)}/` +
    `${encodeURIComponent(code)}`;

  const { res, text, json } = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ redirectUri: ru }),
  });

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
  hashAlgo?: string;
  signAlgo?: string;
}) {
  const env = params.environment ?? pickEnv(process.env.DIGIGO_ENV);
  const b = baseUrl(env);
  const cid = clientId();

  const credentialId = ensure(s(params.credentialId), "CREDENTIAL_ID");
  const sad = ensure(s(params.sad), "SAD");
  const hashes = Array.isArray(params.hashes) ? params.hashes.map(s).filter(Boolean) : [];
  if (!hashes.length) return { ok: false as const, error: "HASHES_MISSING" };

  const hashAlgo = s(params.hashAlgo || "SHA256");
  const signAlgo = s(params.signAlgo || "RSA");

  const url =
    `${b}/tunsign-proxy-webapp/services/v1/signatures/signHash/` +
    `${encodeURIComponent(cid)}/` +
    `${encodeURIComponent(credentialId)}/` +
    `${encodeURIComponent(sad)}/` +
    `${encodeURIComponent(hashAlgo)}/` +
    `${encodeURIComponent(signAlgo)}`;

  const { res, text, json } = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(hashes),
  });

  if (!res.ok) {
    return { ok: false as const, error: json?.message || json?.error || text || `HTTP_${res.status}` };
  }

  const value =
    s(json?.value) ||
    s(json?.signature) ||
    s(Array.isArray(json?.signatures) ? json.signatures?.[0] : "") ||
    s(Array.isArray(json?.values) ? json.values?.[0] : "") ||
    s(Array.isArray(json) ? json?.[0]?.value : "");

  const algorithm = s(json?.algorithm || json?.alg || (Array.isArray(json) ? json?.[0]?.algorithm : ""));

  if (!value) return { ok: false as const, error: "SIGNATURE_VALUE_MISSING" };

  return { ok: true as const, value, algorithm, raw: json };
}
