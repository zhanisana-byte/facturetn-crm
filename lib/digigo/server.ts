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
  const u = env("DIGIGO_BASE_URL");
  return u.replace(/\/+$/, "");
}

function allowInsecure() {
  return boolEnv("DIGIGO_ALLOW_INSECURE", "false");
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

function scope() {
  return env("DIGIGO_SCOPE", "openid");
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

    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

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

export function digigoAuthorizeUrl(params: { state: string; login_hint?: string; credential_id?: string }) {
  const u = new URL(baseUrl() + "/oauth2/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId());
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("scope", scope());
  u.searchParams.set("state", s(params.state));

  if (params.login_hint) u.searchParams.set("login_hint", s(params.login_hint));
  if (params.credential_id) u.searchParams.set("credential_id", s(params.credential_id));

  return u.toString();
}

export async function digigoOauthToken(params: { code: string; credentialId?: string }) {
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
    const msg = typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? {});
    return { ok: false, status: r.status, error: `DIGIGO_OAUTH_TOKEN_${r.status}:${msg}` };
  }

  const d: any = r.data || {};
  return { ok: true, ...d };
}

type SignHashArgs =
  | { token: string; credentialId?: string; sad: string; hashes: string[] }
  | { credentialId?: string; sad: string; hashes: string[] };

export async function digigoSignHash(args: SignHashArgs) {
  const url = baseUrl() + "/api/signHash";

  const anyArgs: any = args as any;
  const token = s(anyArgs.token || anyArgs.access_token || anyArgs.bearer || "");

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const r = await fetchJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      credentialId: anyArgs.credentialId ?? undefined,
      sad: s(anyArgs.sad),
      hashes: anyArgs.hashes,
    }),
  });

  if (!r.ok) {
    const msg = typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? {});
    return { ok: false, status: r.status, error: `DIGIGO_SIGNHASH_${r.status}:${msg}` };
  }

  const d: any = r.data || {};
  return { ok: true, ...d };
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(Buffer.from(input, "utf8")).digest("base64");
}

export function jwtGetJti(token: string) {
  const t = String(token ?? "").trim();
  if (!t) return "";

  const parts = t.split(".");
  if (parts.length < 2) return "";

  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const raw = b64 + pad;

  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return String(payload?.jti ?? "").trim();
  } catch {
    return "";
  }
}
