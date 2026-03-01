import crypto from "crypto";

export type DigigoEnv = "test" | "production";

function must(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

function clean(v?: string | null) {
  const x = String(v ?? "").trim();
  return x.length ? x : null;
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

function baseUrl() {
  return must("DIGIGO_BASE_URL").replace(/\/+$/, "");
}

function insecureTlsEnabled() {
  const v = clean(process.env.DIGIGO_INSECURE_TLS);
  return v === "1" || v === "true" || v === "yes";
}

async function digigoFetch(url: string, init: RequestInit) {
  try {
    if (insecureTlsEnabled()) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    const r = await fetch(url, { ...init, cache: "no-store" });
    return r;
  } catch (e: any) {
    const msg = clean(e?.message) || "FETCH_FAILED";
    const cause = clean(e?.cause?.message) || clean(e?.cause) || null;
    throw new Error(`DIGIGO_FETCH_FAILED:${msg}${cause ? `:${cause}` : ""}`);
  } finally {
    if (insecureTlsEnabled()) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
    }
  }
}

export function digigoAuthorizeUrl(args: {
  state: string;
  hashBase64: string;
  credentialId: string;
  numSignatures?: number;
}) {
  const redirectUri = must("DIGIGO_REDIRECT_URI");
  const clientId = must("DIGIGO_CLIENT_ID");

  const u = new URL(`${baseUrl()}/tunsign-proxy-webapp/oauth2/authorize`);
  u.searchParams.set("redirectUri", redirectUri);
  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("credentialId", args.credentialId);
  u.searchParams.set("clientId", clientId);
  u.searchParams.set("numSignatures", String(args.numSignatures ?? 1));
  u.searchParams.set("hash", args.hashBase64);
  u.searchParams.set("state", args.state);

  return u.toString();
}

export function extractJwtJti(tokenJwt: string) {
  const parts = String(tokenJwt || "").split(".");
  if (parts.length !== 3) throw new Error("INVALID_AUTH_TOKEN_JWT");
  const payloadJson = Buffer.from(
    parts[1].replace(/-/g, "+").replace(/_/g, "/"),
    "base64"
  ).toString("utf8");
  const payload = JSON.parse(payloadJson);
  const jti = String(payload?.jti || "").trim();
  if (!jti) throw new Error("JWT_JTI_MISSING");
  return { jti, payload };
}

export async function digigoOauthTokenFromJti(args: { jti: string }) {
  const clientId = must("DIGIGO_CLIENT_ID");
  const clientSecret = must("DIGIGO_CLIENT_SECRET");
  const redirectUri = must("DIGIGO_REDIRECT_URI");

  const grantType = "authorization_code";
  const url =
    `${baseUrl()}/tunsign-proxy-webapp/services/v1/oauth2/token/` +
    `${encodeURIComponent(clientId)}/${encodeURIComponent(grantType)}/${encodeURIComponent(
      clientSecret
    )}/${encodeURIComponent(args.jti)}`;

  const r = await digigoFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUri }),
  });

  const txt = await r.text();
  if (!r.ok) throw new Error(`OAUTH_TOKEN_FAILED:${r.status}:${txt}`);

  const json = JSON.parse(txt);
  const sad = String(json?.sad || "").trim();
  if (!sad) throw new Error("SAD_EMPTY");
  return { sad, raw: json };
}

export async function digigoSignHash(args: {
  sad: string;
  credentialId: string;
  hashesBase64: string[];
  hashAlgo?: "SHA256";
  signAlgo?: "RSA";
}) {
  const clientId = must("DIGIGO_CLIENT_ID");
  const hashAlgo = args.hashAlgo ?? "SHA256";
  const signAlgo = args.signAlgo ?? "RSA";

  const url =
    `${baseUrl()}/tunsign-proxy-webapp/services/v1/signatures/signHash/` +
    `${encodeURIComponent(clientId)}/${encodeURIComponent(args.credentialId)}/${encodeURIComponent(
      args.sad
    )}/${hashAlgo}/${signAlgo}`;

  const r = await digigoFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args.hashesBase64),
  });

  const txt = await r.text();
  if (!r.ok) throw new Error(`SIGNHASH_FAILED:${r.status}:${txt}`);

  const json = JSON.parse(txt);
  const value = Array.isArray(json)
    ? String(json?.[0]?.value || "")
    : String(json?.value || "");

  if (!value) throw new Error("SIGNATURE_VALUE_EMPTY");
  return { value, raw: json };
}
