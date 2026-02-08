import crypto from "crypto";
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";

function env(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

export function digigoBaseUrl() {
  return env("DIGIGO_BASE_URL").replace(/\/$/, "");
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

function buildAgent() {
  const proxy = ttnProxyUrl();
  if (proxy) return new HttpsProxyAgent(proxy);
  if (digigoAllowInsecure()) {
    return new https.Agent({ rejectUnauthorized: false });
  }
  return undefined;
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function digigoAuthorizeUrl(input: {
  credentialId: string;
  hashBase64: string;
  numSignatures?: number;
  state: string;
}) {
  const base = digigoBaseUrl();

  const u = new URL(`${base}/tunsign-proxy-webapp/oauth2/authorize`);

  u.searchParams.set("redirectUri", digigoRedirectUri());
  u.searchParams.set("responseType", "code");
  u.searchParams.set("clientId", digigoClientId());

  u.searchParams.set("scope", "credential");
  u.searchParams.set("credentialId", input.credentialId);
  u.searchParams.set("numSignatures", String(input.numSignatures ?? 1));
  u.searchParams.set("hash", input.hashBase64);
  u.searchParams.set("state", input.state);

  return u.toString();
}
