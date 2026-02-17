import https from "https";
import crypto from "crypto";

export type DigigoEnv = "TEST" | "PROD";

function s(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function ensure(v: string, err: string) {
  if (!v) throw new Error(err);
  return v;
}

function pickEnv(v?: string): DigigoEnv {
  const vv = s(v).toUpperCase();
  if (vv === "PROD") return "PROD";
  if (vv === "TEST") return "TEST";
  const isProd =
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production";
  return isProd ? "PROD" : "TEST";
}

function baseUrl(env: DigigoEnv) {
  const legacy = s(process.env.DIGIGO_BASE_URL || "").replace(/\/$/, "");
  const test = s(process.env.DIGIGO_BASE_URL_TEST || "").replace(/\/$/, "");
  const prod = s(process.env.DIGIGO_BASE_URL_PROD || "").replace(/\/$/, "");
  if (env === "PROD") return ensure(prod || legacy, "DIGIGO_BASE_URL_PROD_MISSING");
  return ensure(test || legacy, "DIGIGO_BASE_URL_TEST_MISSING");
}

function clientId() {
  return ensure(s(process.env.DIGIGO_CLIENT_ID || ""), "DIGIGO_CLIENT_ID_MISSING");
}

function clientSecret() {
  return ensure(s(process.env.DIGIGO_CLIENT_SECRET || ""), "DIGIGO_CLIENT_SECRET_MISSING");
}

function redirectUri() {
  return ensure(s(process.env.DIGIGO_REDIRECT_URI || ""), "DIGIGO_REDIRECT_URI_MISSING");
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

  const text = await res.text().catch(() => "");
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}

  return { res, text, json };
}

export function digigoAuthorizeUrl(params: {
  credentialId: string;
  state: string;
  environment?: DigigoEnv;
  hash?: string;
  numSignatures?: number;
}) {
  const env = params.environment ?? pickEnv(process.env.DIGIGO_ENV);
  const b = baseUrl(env);
  const cid = clientId();
  const ru = redirectUri();

  const credentialId = ensure(s(params.credentialId), "CREDENTIAL_ID_MISSING");
  const state = ensure(s(params.state), "STATE_MISSING");

  const numSignatures = Number.isFinite(Number(params.numSignatures))
    ? String(Number(params.numSignatures))
    : "1";

  const hash = s(params.hash || "");

  const scope = "credential";

  const q =
    `redirectUri=${encodeURIComponent(ru)}` +
    `&responseType=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&credentialId=${encodeURIComponent(credentialId)}` +
    `&clientId=${encodeURIComponent(cid)}` +
    `&numSignatures=${encodeURIComponent(numSignatures)}` +
    (hash ? `&hash=${encodeURIComponent(hash)}` : "") +
    `&state=${encodeURIComponent(state)}`;

  return `${b}/tunsign-proxy-webapp/oauth2/authorize?${q}`;
}

export async function digigoOauthToken(params: { code: string; environment?: DigigoEnv }) {
  const env = params.environment ?? pickEnv(process.env.DIGIGO_ENV);
  const b = baseUrl(env);
  const cid = clientId();
  const secret = clientSecret();
  const code = ensure(s(params.code), "CODE_MISSING");
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

  const credentialId = ensure(s(params.credentialId), "CREDENTIAL_ID_MISSING");
  const sad = ensure(s(params.sad), "SAD_MISSING");
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
