import crypto from "crypto";

function s(v: any) {
  return String(v ?? "").trim();
}

function env(name: string, fallback = "") {
  return s(process.env[name] ?? fallback);
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

export function digigoRedirectUri() {
  return env("DIGIGO_REDIRECT_URI");
}

export function sha256Base64Utf8(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

type DigigoAuthorizeArgs = {
  credentialId: string;
  hashBase64: string;
  numSignatures?: number;
  state?: string;
  redirectUri?: string;
};

export function digigoAuthorizeUrl(args: DigigoAuthorizeArgs): string {
  const clientId = digigoClientId();
  if (!clientId) throw new Error("DIGIGO_CLIENT_ID missing");

  const base = digigoProxyBaseUrl();
  if (!base) throw new Error("DIGIGO_BASE_URL missing");

  const credentialId = s(args.credentialId);
  const hash = s(args.hashBase64);
  if (!credentialId) throw new Error("credentialId missing");
  if (!hash) throw new Error("hashBase64 missing");

  const redirectUri = s(args.redirectUri) || digigoRedirectUri();
  if (!redirectUri) throw new Error("DIGIGO_REDIRECT_URI missing");
  if (!/^https?:\/\//i.test(redirectUri)) throw new Error("DIGIGO_REDIRECT_URI invalid");

  const numSignatures =
    Number.isFinite(args.numSignatures as number) && Number(args.numSignatures) > 0
      ? String(Number(args.numSignatures))
      : "1";

  const u = new URL(`${base}/oauth2/authorize`);

  u.searchParams.set("redirectUri", redirectUri);
  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("credentialId", credentialId);
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("numSignatures", numSignatures);
  u.searchParams.set("hash", hash);

  const st = s(args.state);
  if (st) u.searchParams.set("state", st);

  return u.toString();
}
