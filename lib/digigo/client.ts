import crypto from "crypto";

function env(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

export function digigoBaseUrl() {
  return env("DIGIGO_BASE_URL").replace(/\/$/, "");
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
  return env("DIGIGO_REDIRECT_URI");
}

export function digigoGrantType() {
  return env("DIGIGO_GRANT_TYPE", "authorization_code");
}

export function digigoAllowInsecure() {
  return env("DIGIGO_ALLOW_INSECURE", "true").toLowerCase() === "true";
}

export function ttnProxyUrl() {
  return env("TTN_PROXY_URL");
}

export function sha256Base64Utf8(input: string): string {
  return crypto.createHash("sha256").update(input ?? "", "utf8").digest("base64");
}

type DigigoAuthorizeArgs = {
  credentialId: string;
  hashBase64: string;
  numSignatures?: number;
  state?: string;
  redirectUri?: string;
};

export function digigoAuthorizeUrl(args: DigigoAuthorizeArgs): string {
  const redirectUri = String(args.redirectUri || digigoRedirectUri() || "").trim();
  const clientId = digigoClientId();

  const credentialId = String(args.credentialId || "").trim();
  const hash = String(args.hashBase64 || "").trim();
  const numSignatures = Number.isFinite(args.numSignatures as number)
    ? String(args.numSignatures)
    : "1";

  const state = String(args.state || "").trim();

  if (!redirectUri) throw new Error("DIGIGO_REDIRECT_URI missing");
  if (!clientId) throw new Error("DIGIGO_CLIENT_ID missing");
  if (!credentialId) throw new Error("credentialId missing");
  if (!hash) throw new Error("hashBase64 missing");
  if (!state) throw new Error("state missing");

  const u = new URL(`${digigoProxyBaseUrl()}/oauth2/authorize`);

  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("scope", "credential");
  u.searchParams.set("state", state);

  u.searchParams.set("credentialId", credentialId);
  u.searchParams.set("numSignatures", numSignatures);
  u.searchParams.set("hash", hash);

  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("redirectUri", redirectUri);

  u.searchParams.set("clientId", clientId);
  u.searchParams.set("responseType", "code");

  return u.toString();
}

function b64urlToUtf8(input: string) {
  const s = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return Buffer.from(s + pad, "base64").toString("utf8");
}

export function digigoTokenPayload(token: string): any {
  const t = String(token || "").trim();
  const parts = t.split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(b64urlToUtf8(parts[1]));
  } catch {
    return {};
  }
}
