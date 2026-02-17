// lib/digigo/server.ts
import crypto from "crypto";

function must(name: string) {
  const v = String(process.env[name] || "").trim();
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

function baseUrl() {
  // ex: https://193.95.63.230 (test) ou https://digigo.tuntrust.tn (prod)
  return must("DIGIGO_BASE_URL").replace(/\/+$/, "");
}

export function digigoAuthorizeUrl(args: {
  state: string;
  hashBase64: string;
  credentialId: string; // email du signataire
  numSignatures?: number;
}) {
  const redirectUri = must("DIGIGO_REDIRECT_URI");
  const clientId = must("DIGIGO_CLIENT_ID");

  // D'après le PDF: /tunsign-proxy-webapp/oauth2/authorize
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

// JWT -> payload (sans vérifier signature)
export function extractJwtJti(tokenJwt: string) {
  const parts = String(tokenJwt || "").split(".");
  if (parts.length !== 3) throw new Error("INVALID_AUTH_TOKEN_JWT");
  const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const payload = JSON.parse(payloadJson);
  const jti = String(payload?.jti || "").trim();
  if (!jti) throw new Error("JWT_JTI_MISSING");
  return { jti, payload };
}

export async function digigoOauthTokenFromJti(args: { jti: string }) {
  const clientId = must("DIGIGO_CLIENT_ID");
  const clientSecret = must("DIGIGO_CLIENT_SECRET");
  const redirectUri = must("DIGIGO_REDIRECT_URI");

  // D'après le PDF:
  // /tunsign-proxy-webapp/services/v1/oauth2/token/{clientId}/{grantType}/{clientSecret}/{code}
  const grantType = "authorization_code";
  const url =
    `${baseUrl()}/tunsign-proxy-webapp/services/v1/oauth2/token/` +
    `${encodeURIComponent(clientId)}/${encodeURIComponent(grantType)}/${encodeURIComponent(clientSecret)}/${encodeURIComponent(args.jti)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirectUri }),
    cache: "no-store",
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
  credentialId: string; // email
  hashesBase64: string[]; // tableau de hash base64
  hashAlgo?: "SHA256";
  signAlgo?: "RSA";
}) {
  const clientId = must("DIGIGO_CLIENT_ID");
  const hashAlgo = args.hashAlgo ?? "SHA256";
  const signAlgo = args.signAlgo ?? "RSA";

  // D'après le PDF:
  // /tunsign-proxy-webapp/services/v1/signatures/signHash/{clientId}/{credentialId}/{sad}/{hashAlgo}/{signAlgo}
  const url =
    `${baseUrl()}/tunsign-proxy-webapp/services/v1/signatures/signHash/` +
    `${encodeURIComponent(clientId)}/${encodeURIComponent(args.credentialId)}/${encodeURIComponent(args.sad)}/${hashAlgo}/${signAlgo}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args.hashesBase64),
    cache: "no-store",
  });

  const txt = await r.text();
  if (!r.ok) throw new Error(`SIGNHASH_FAILED:${r.status}:${txt}`);

  const json = JSON.parse(txt);

  // Réponse attendue: [ { algorithm, value } ]
  const value = Array.isArray(json) ? String(json?.[0]?.value || "") : String(json?.value || "");
  if (!value) throw new Error("SIGNATURE_VALUE_EMPTY");
  return { value, raw: json };
}
