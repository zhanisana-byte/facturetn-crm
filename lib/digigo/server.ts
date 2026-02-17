import https from "https";
import crypto from "crypto";

function s(v: any) {
  return String(v ?? "").trim();
}

function ensure(v: string, name: string) {
  if (!v) throw new Error(`${name}_MISSING`);
  return v;
}

function baseUrl() {
  return ensure(process.env.DIGIGO_BASE_URL || "", "DIGIGO_BASE_URL_MISSING");
}

function clientId() {
  return ensure(process.env.DIGIGO_CLIENT_ID || "", "DIGIGO_CLIENT_ID_MISSING");
}

function clientSecret() {
  return ensure(process.env.DIGIGO_CLIENT_SECRET || "", "DIGIGO_CLIENT_SECRET_MISSING");
}

function redirectUri() {
  return ensure(process.env.DIGIGO_REDIRECT_URI || "", "DIGIGO_REDIRECT_URI_MISSING");
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

async function fetchJson(url: string, init: RequestInit) {
  const agent =
    process.env.DIGIGO_INSECURE_TLS === "true"
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

  const res = await fetch(url, { ...init, agent } as any);

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
}) {
  const b = baseUrl();
  const cid = clientId();
  const ru = redirectUri();

  return (
    `${b}/tunsign-proxy-webapp/oauth2/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(cid)}` +
    `&redirect_uri=${encodeURIComponent(ru)}` +
    `&credentialID=${encodeURIComponent(params.credentialId)}` +
    `&state=${encodeURIComponent(params.state)}`
  );
}

export async function digigoOauthToken(params: { code: string }) {
  const b = baseUrl();
  const cid = clientId();
  const secret = clientSecret();
  const ru = redirectUri();

  const url =
    `${b}/tunsign-proxy-webapp/services/v1/oauth2/token/` +
    `${encodeURIComponent(cid)}/authorization_code/` +
    `${encodeURIComponent(secret)}/` +
    `${encodeURIComponent(params.code)}`;

  const { res, text, json } = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUri: ru }),
  });

  if (!res.ok) {
    return { ok: false as const, error: json?.message || text };
  }

  return {
    ok: true as const,
    sad: s(json?.sad || json?.access_token),
  };
}

export async function digigoSignHash(params: {
  credentialId: string;
  sad: string;
  hashes: string[];
}) {
  const b = baseUrl();
  const cid = clientId();

  const url =
    `${b}/tunsign-proxy-webapp/services/v1/signatures/signHash/` +
    `${encodeURIComponent(cid)}/` +
    `${encodeURIComponent(params.credentialId)}/` +
    `${encodeURIComponent(params.sad)}/SHA256/RSA`;

  const { res, text, json } = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params.hashes),
  });

  if (!res.ok) {
    return { ok: false as const, error: json?.message || text };
  }

  const value =
    s(json?.value) ||
    s(json?.signature) ||
    s(Array.isArray(json?.signatures) ? json.signatures[0] : "");

  return { ok: true as const, value };
}
