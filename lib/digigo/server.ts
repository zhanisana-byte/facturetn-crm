import crypto from "crypto";

export type DigigoEnv = "TEST" | "PROD";

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function isLikelyJwt(v: string) {
  const s = String(v || "");
  return s.split(".").length === 3;
}

export function digigoAuthorizeUrl(args: {
  hash: string;
  state: string;
  credentialId: string;
  environment: DigigoEnv;
  numSignatures?: number;
}) {
  const redirectUri = must("NEXT_PUBLIC_DIGIGO_REDIRECT_URI");
  const clientId =
    args.environment === "PROD"
      ? must("DIGIGO_CLIENT_ID_PROD")
      : must("DIGIGO_CLIENT_ID_TEST");

  const base =
    args.environment === "PROD"
      ? must("DIGIGO_AUTHORIZE_URL_PROD")
      : must("DIGIGO_AUTHORIZE_URL_TEST");

  const u = new URL(base);

  u.searchParams.set("redirectUri", redirectUri);
  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("credentialId", args.credentialId);
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("numSignatures", String(args.numSignatures ?? 1));
  u.searchParams.set("hash", args.hash);
  u.searchParams.set("state", args.state);

  return u.toString();
}

export async function digigoOauthToken(args: {
  code: string;
  environment: DigigoEnv;
}) {
  const base =
    args.environment === "PROD"
      ? must("DIGIGO_OAUTH_TOKEN_URL_PROD")
      : must("DIGIGO_OAUTH_TOKEN_URL_TEST");

  const redirectUri = must("NEXT_PUBLIC_DIGIGO_REDIRECT_URI");
  const clientId =
    args.environment === "PROD"
      ? must("DIGIGO_CLIENT_ID_PROD")
      : must("DIGIGO_CLIENT_ID_TEST");
  const clientSecret =
    args.environment === "PROD"
      ? must("DIGIGO_CLIENT_SECRET_PROD")
      : must("DIGIGO_CLIENT_SECRET_TEST");

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", args.code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);

  const r = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const txt = await r.text();
  if (!r.ok) throw new Error(`OAUTH_TOKEN_FAILED:${r.status}:${txt}`);

  const json = JSON.parse(txt);
  const accessToken = json?.access_token;
  if (!accessToken) throw new Error("OAUTH_TOKEN_EMPTY");
  return { accessToken, raw: json };
}

export async function digigoGetSad(args: {
  accessToken: string;
  environment: DigigoEnv;
}) {
  const base =
    args.environment === "PROD"
      ? must("DIGIGO_SAD_URL_PROD")
      : must("DIGIGO_SAD_URL_TEST");

  const r = await fetch(base, {
    method: "GET",
    headers: { Authorization: `Bearer ${args.accessToken}` },
    cache: "no-store",
  });

  const txt = await r.text();
  if (!r.ok) throw new Error(`SAD_FAILED:${r.status}:${txt}`);

  const json = JSON.parse(txt);
  if (!json) throw new Error("SAD_EMPTY");
  return json;
}

export async function digigoSignHash(args: {
  accessToken: string;
  hash: string;
  environment: DigigoEnv;
}) {
  const base =
    args.environment === "PROD"
      ? must("DIGIGO_SIGN_HASH_URL_PROD")
      : must("DIGIGO_SIGN_HASH_URL_TEST");

  const r = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hash: args.hash }),
    cache: "no-store",
  });

  const txt = await r.text();
  if (!r.ok) throw new Error(`SIGNHASH_FAILED:${r.status}:${txt}`);

  const json = JSON.parse(txt);
  const signature = json?.signature || json?.signedHash || json?.signed_hash;
  if (!signature) throw new Error("SIGNATURE_EMPTY");
  return { signature, raw: json };
}
