import crypto from "crypto";

function s(v: any) {
  return String(v ?? "").trim();
}

function env(name: string, fallback = "") {
  return s(process.env[name] ?? fallback);
}

function baseUrl() {
  const raw = env("DIGIGO_BASE_URL").replace(/\/+$/, "");
  if (!raw) throw new Error("DIGIGO_BASE_URL_MISSING");
  if (raw.includes("/tunsign-proxy-webapp")) return raw;
  return raw + "/tunsign-proxy-webapp";
}

function clientId() {
  const v = env("DIGIGO_CLIENT_ID");
  if (!v) throw new Error("DIGIGO_CLIENT_ID_MISSING");
  return v;
}

function redirectUri() {
  const v = env("DIGIGO_REDIRECT_URI");
  if (!v) throw new Error("DIGIGO_REDIRECT_URI_MISSING");
  return v;
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

  const cred =
    s(params.credentialId) || env("DIGIGO_CREDENTIAL_ID");
  if (cred) u.searchParams.set("credentialId", cred);

  return u.toString();
}
