export type DigigoEnv = "test" | "production";

function s(v: any) {
  return String(v ?? "").trim();
}

function mustEnv(key: string) {
  const v = s(process.env[key]);
  if (!v) throw new Error(`${key}_MISSING`);
  return v;
}

export function digigoAuthorizeUrl(args: {
  state: string;
  hashBase64: string;
  credentialId: string;
  numSignatures?: number;
  environment?: DigigoEnv;
}) {
  const authorizeBase =
    args.environment === "test"
      ? mustEnv("DIGIGO_AUTHORIZE_BASE_URL_TEST")
      : mustEnv("DIGIGO_AUTHORIZE_BASE_URL");

  const redirectUri = mustEnv("DIGIGO_REDIRECT_URI");
  const clientId = mustEnv("DIGIGO_CLIENT_ID");

  const state = s(args.state);
  const hash = s(args.hashBase64);
  const credentialId = s(args.credentialId);
  const numSignatures = String(args.numSignatures ?? 1);

  const url =
    `${authorizeBase}` +
    `?redirectUri=${encodeURIComponent(redirectUri)}` +
    `&responseType=code` +
    `&scope=credential` +
    `&credentialId=${encodeURIComponent(credentialId)}` +
    `&clientId=${encodeURIComponent(clientId)}` +
    `&numSignatures=${encodeURIComponent(numSignatures)}` +
    `&hash=${encodeURIComponent(hash)}` +
    `&state=${encodeURIComponent(state)}`;

  return url;
}

export function sha256Base64Utf8(input: string) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}
