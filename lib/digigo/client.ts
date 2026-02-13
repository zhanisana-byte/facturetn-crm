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
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

type DigigoAuthorizeArgs = {
  credentialId: string;
  hashBase64: string;
  numSignatures?: number;
  state?: string;
  invoiceId?: string;
  backUrl?: string;
};

function addQuery(baseUrl: string, params: Record<string, string | undefined>) {
  const u = new URL(baseUrl);
  for (const [k, v] of Object.entries(params)) {
    const val = String(v ?? "").trim();
    if (val) u.searchParams.set(k, val);
  }
  return u.toString();
}

export function digigoAuthorizeUrl(args: DigigoAuthorizeArgs): string {
  const baseRedirectUri = digigoRedirectUri();
  const clientId = digigoClientId();

  const credentialId = String(args.credentialId || "").trim();
  const hash = String(args.hashBase64 || "").trim();
  const numSignatures = Number.isFinite(args.numSignatures as number)
    ? String(args.numSignatures)
    : "1";

  if (!baseRedirectUri) throw new Error("DIGIGO_REDIRECT_URI missing");
  if (!clientId) throw new Error("DIGIGO_CLIENT_ID missing");
  if (!credentialId) throw new Error("credentialId missing");
  if (!hash) throw new Error("hashBase64 missing");

  const redirectUri = addQuery(baseRedirectUri, {
    state: args.state,
    invoice_id: args.invoiceId,
    back_url: args.backUrl,
  });

  const u = new URL(`${digigoProxyBaseUrl()}/oauth2/authorize`);

  u.searchParams.set("redirectUri", redirectUri);
  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("credentialId", credentialId);
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("numSignatures", numSignatures);
  u.searchParams.set("hash", hash);

  if (args.state) u.searchParams.set("state", String(args.state));

  return u.toString();
}
