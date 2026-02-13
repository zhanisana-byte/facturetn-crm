function s(v: any) {
  return String(v ?? "").trim();
}

function env(key: string) {
  return s(process.env[key]);
}

function addQuery(base: string, params: Record<string, string>) {
  const sep = base.includes("?") ? "&" : "?";
  return base + sep + new URLSearchParams(params).toString();
}

export function sha256Base64Utf8(input: string) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function digigoAuthorizeUrl(args: {
  credentialId: string;
  hashBase64: string;
  redirectUri: string;
  numSignatures?: number;
}) {
  const clientId = env("DIGIGO_CLIENT_ID");
  if (!clientId) throw new Error("DIGIGO_CLIENT_ID missing");

  const baseUrl = env("DIGIGO_BASE_URL");
  if (!baseUrl) throw new Error("DIGIGO_BASE_URL missing");

  const redirectUri = s(args.redirectUri);
  if (!redirectUri || !/^https?:\/\//i.test(redirectUri)) throw new Error("redirectUri invalid");

  const authorize = baseUrl.replace(/\/$/, "") + "/oauth2/authorize";

  return addQuery(authorize, {
    redirectUri,
    responseType: "code",
    scope: "credential",
    credentialId: s(args.credentialId),
    clientId,
    numSignatures: String(Number(args.numSignatures ?? 1) || 1),
    hash: s(args.hashBase64),
  });
}
