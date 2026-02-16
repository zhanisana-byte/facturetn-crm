import crypto from "crypto";

function s(v: any) {
  return String(v ?? "").trim();
}

function env(name: string, fallback = "") {
  return s(process.env[name] ?? fallback);
}

function baseUrl() {
  const raw = env("DIGIGO_BASE_URL", "https://193.95.63.230").replace(/\/+$/, "");
  if (raw.includes("/tunsign-proxy-webapp")) return raw;
  return raw + "/tunsign-proxy-webapp";
}

function clientId() {
  const v = env("DIGIGO_CLIENT_ID");
  if (!v) throw new Error("DIGIGO_CLIENT_ID_MISSING");
  return v;
}

function clientSecret() {
  const v = env("DIGIGO_CLIENT_SECRET");
  if (!v) throw new Error("DIGIGO_CLIENT_SECRET_MISSING");
  return v;
}

function redirectUri() {
  const forced = env("DIGIGO_REDIRECT_URI_FORCE");
  if (forced) return forced;
  const v = env("DIGIGO_REDIRECT_URI");
  if (v) return v;
  return "https://facturetn-crm-iota.vercel.app/digigo/redirect";
}

function allowInsecure() {
  return env("DIGIGO_ALLOW_INSECURE", "false").toLowerCase() === "true";
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

    let data: any = null;
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

export function digigoAuthorizeUrl(args: {
  state: string;
  hash: string;
  credentialId: string;
  numSignatures?: number;
}) {
  const u = new URL(baseUrl() + "/oauth2/authorize");

  u.searchParams.set("redirectUri", redirectUri());
  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("credentialId", s(args.credentialId));
  u.searchParams.set("clientId", clientId());
  u.searchParams.set("numSignatures", String(args.numSignatures ?? 1));
  u.searchParams.set("hash", s(args.hash));
  u.searchParams.set("state", s(args.state));

  return u.toString();
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
    const msg = typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? {});
    return { ok: false as const, status: r.status, error: msg, raw: r.data };
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
  const hashes = Array.isArray(args.hashes) ? args.hashes.map(s).filter(Boolean) : [];

  if (!token) return { ok: false as const, status: 400, error: "MISSING_TOKEN" };
  if (!credentialId) return { ok: false as const, status: 400, error: "MISSING_CREDENTIAL_ID" };
  if (!sad) return { ok: false as const, status: 400, error: "MISSING_SAD" };
  if (!hashes.length) return { ok: false as const, status: 400, error: "MISSING_HASHES" };

  const url =
    baseUrl() +
    `/signatures/signHash/${encodeURIComponent(clientId())}/${encodeURIComponent(
      credentialId
    )}/${encodeURIComponent(sad)}/SHA-256/RSA`;

  const r = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ hashes }),
  });

  if (!r.ok) {
    const msg = typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? {});
    return { ok: false as const, status: r.status, error: msg, raw: r.data };
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
    const dump = typeof r.data === "string" ? r.data : JSON.stringify(r.data ?? {});
    return { ok: false as const, status: 200, error: dump, raw: d };
  }

  return { ok: true as const, value: signature, raw: d };
}
