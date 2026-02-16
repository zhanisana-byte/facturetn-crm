import crypto from "crypto";

type JsonValue = any;

function s(v: any) {
  return String(v ?? "").trim();
}

function env(name: string, fallback = "") {
  return s(process.env[name] ?? fallback);
}

function boolEnv(name: string, fallback = "false") {
  return s(process.env[name] ?? fallback).toLowerCase() === "true";
}

function baseUrl() {
  return env("DIGIGO_BASE_URL").replace(/\/+$/, "");
}

function clientId() {
  return env("DIGIGO_CLIENT_ID");
}

function clientSecret() {
  return env("DIGIGO_CLIENT_SECRET");
}

function redirectUri() {
  return env("DIGIGO_REDIRECT_URI");
}

function allowInsecure() {
  return boolEnv("DIGIGO_ALLOW_INSECURE", "false");
}

function timeoutMs() {
  const v = Number(env("DIGIGO_TIMEOUT_MS", "20000"));
  return Number.isFinite(v) && v > 0 ? v : 20000;
}

async function fetchJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs());

  const prevTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  const insecure = allowInsecure();

  try {
    if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    const res = await fetch(url, { ...init, signal: controller.signal });

    const txt = await res.text().catch(() => "");
    let data: JsonValue = txt;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {
      data = txt;
    }

    return { ok: res.ok, status: res.status, data };
  } finally {
    if (insecure) {
      if (prevTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevTls;
    }
    clearTimeout(t);
  }
}

export function sha256Base64Utf8(input: string) {
  return crypto
    .createHash("sha256")
    .update(Buffer.from(String(input ?? ""), "utf8"))
    .digest("base64");
}

export function digigoAuthorizeUrl(params: {
  state: string;
  hash: string;
  credentialId?: string;
}) {
  const u = new URL(baseUrl() + "/oauth2/authorize");

  u.searchParams.set("redirectUri", redirectUri());
  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("clientId", clientId());
  u.searchParams.set("numSignatures", "1");
  u.searchParams.set("hash", s(params.hash));
  u.searchParams.set("state", s(params.state));

  const cred = s(params.credentialId) || env("DIGIGO_CREDENTIAL_ID");
  if (cred) u.searchParams.set("credentialId", cred);

  return u.toString();
}

export async function digigoOauthToken(params: { code: string }) {
  const url = baseUrl() + "/oauth2/token";

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", clientId());
  body.set("client_secret", clientSecret());
  body.set("redirect_uri", redirectUri());
  body.set("code", s(params.code));

  const r = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!r.ok) {
    const msg =
      typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? {});
    return {
      ok: false as const,
      status: r.status,
      error: `DIGIGO_OAUTH_TOKEN_${r.status}:${msg}`,
    };
  }

  return { ok: true as const, ...(r.data || {}) };
}

export async function digigoSignHash(args: {
  token: string;
  credentialId: string;
  sad: string;
  hashes: string[];
}) {
  const token = s(args.token);
  const credentialId = s(args.credentialId);
  const sad = s(args.sad);
  const hashes = Array.isArray(args.hashes)
    ? args.hashes.map((h) => s(h)).filter(Boolean)
    : [];

  if (!token)
    return {
      ok: false as const,
      status: 400,
      error: "DIGIGO_SIGNHASH_MISSING_TOKEN",
    };

  if (!credentialId)
    return {
      ok: false as const,
      status: 400,
      error: "DIGIGO_SIGNHASH_MISSING_CREDENTIAL",
    };

  if (!sad)
    return {
      ok: false as const,
      status: 400,
      error: "DIGIGO_SIGNHASH_MISSING_SAD",
    };

  if (!hashes.length)
    return {
      ok: false as const,
      status: 400,
      error: "DIGIGO_SIGNHASH_MISSING_HASH",
    };

  const url =
    baseUrl() +
    `/signatures/signHash/${encodeURIComponent(
      clientId()
    )}/${encodeURIComponent(credentialId)}/${encodeURIComponent(
      sad
    )}/SHA-256/RSA`;

  const r = await fetchJson(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ hashes }),
  });

  if (!r.ok) {
    const msg =
      typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? {});
    return {
      ok: false as const,
      status: r.status,
      error: `DIGIGO_SIGNHASH_${r.status}:${msg}`,
    };
  }

  const d: any = r.data || {};

  const signature =
    s(d?.signature) ||
    s(d?.signatures?.[0]?.signature) ||
    s(d?.values?.[0]) ||
    s(d?.value) ||
    s(d?.data?.signature) ||
    s(d?.data?.signatures?.[0]?.signature);

  if (!signature) {
    const dump =
      typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? {});
    return { ok: false as const, status: 200, error: `SIGNATURE_EMPTY:${dump}` };
  }

  return { ok: true as const, value: signature, raw: d };
}

export function jwtGetJti(token: string) {
  const t = s(token);
  if (!t) return "";

  const parts = t.split(".");
  if (parts.length < 2) return "";

  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));

  try {
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return s(payload?.jti);
  } catch {
    return "";
  }
}
