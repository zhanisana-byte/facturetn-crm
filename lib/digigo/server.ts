import crypto from "crypto";

function s(v: any) {
  return String(v ?? "").trim();
}

function mustEnv(name: string) {
  const v = s(process.env[name]);
  if (!v) throw new Error(`ENV_MISSING:${name}`);
  return v;
}

export function baseUrl() {
  return s(process.env.DIGIGO_BASE_URL || "");
}

export function redirectUri() {
  return s(process.env.DIGIGO_REDIRECT_URI || "");
}

export function clientId() {
  return mustEnv("DIGIGO_CLIENT_ID");
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

  const cred =
    s(params.credentialId) || s(process.env.DIGIGO_CREDENTIAL_ID || "");
  if (cred) u.searchParams.set("credentialId", cred);

  return u.toString();
}
