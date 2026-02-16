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

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(String(input ?? ""), "utf8").digest("base64");
}

type AuthorizeArgs = {
  credentialId: string;
  hashBase64: string;
  numSignatures?: number;
  responseType?: "code";
  scope?: "credential";
};

export function digigoAuthorizeUrl(args: AuthorizeArgs) {
  const base = digigoProxyBaseUrl();
  const redirectUri = digigoRedirectUri();
  const clientId = digigoClientId();

  const credentialId = String(args.credentialId ?? "").trim();
  const hashBase64 = String(args.hashBase64 ?? "").trim();

  const responseType = args.responseType || "code";
  const scope = args.scope || "credential";
  const numSignatures = Number.isFinite(Number(args.numSignatures)) ? Number(args.numSignatures) : 1;

  if (!base || !redirectUri || !clientId || !credentialId || !hashBase64) {
    throw new Error("DIGIGO_MISSING_PARAMS");
  }

  const u = new URL(`${base}/oauth2/authorize`);
  u.searchParams.set("redirectUri", redirectUri);
  u.searchParams.set("responseType", responseType);
  u.searchParams.set("scope", scope);
  u.searchParams.set("credentialId", credentialId);
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("numSignatures", String(numSignatures));
  u.searchParams.set("hash", hashBase64);

  return u.toString();
}
