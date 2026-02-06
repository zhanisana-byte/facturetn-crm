import crypto from "crypto";
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";

function env(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

export function digigoBaseUrl() {
  return env("DIGIGO_BASE_URL").replace(/\/$/, "");
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

const NDCA_JWT_VERIFY_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIFSTCCAzGgAwIBAgIIW4u+9AWYVYYwDQYJKoZIhvcNAQELBQAwgYoxCzAJBgNV
BAYTAlROMS4wLAYDVQQKDCVOYXRpb25hbCBEaWdpdGFsIENlcnRpZmljYXRpb24g
QWdlbmN5MS4wLAYDVQQLDCVOYXRpb25hbCBEaWdpdGFsIENlcnRpZmljYXRpb24g
QWdlbmN5MRswGQYDVQQDDBJORENBIE1hbmFnZW1lbnQgQ0EwHhcNMTgxMDExMTMz
NDI0WhcNMjExMDEwMTMzNDI0WjCBjTELMAkGA1UEBhMCVE4xMjAwBgNVBAoMKU5h
dGlvbmFsIEFnZW5jeSBGb3IgRGlnaXRhbCBDZXJ0aWZpY2F0aW9uMTIwMAYDVQQL
DClOYXRpb25hbCBBZ2VuY3kgRm9yIERpZ2l0YWwgQ2VydGlmaWNhdGlvbjEWMBQG
A1UEAwwNYWRtaW4udHVuc2lnbjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
ggEBAJgk2xvT1Zq0SqGLgJHdDJlNum/nJbTE1XRVrQa8LAd7kC3u8oDnAo5QRT+X
ZL4V1ohvGzcj5gYHe2JKlZofFr/UXqdeYfu5TlRn1SDTaiX1BUmVWtNBdWwkqJ5U
s4HVqIrxIEihAr6Ag5fQCVJ6uEvkey7a2pfTPPlbZ/dO96QTDGOCRH75SHKwxPgb
qPYIHcK2IaSudPJ5boAiVy+wZk4dTWnedF04P8HrRLtPqE6t0U/cPNsk6XvG1rhY
sfac5Nfh2+vUrXXvnzmIjq+11K27IlMj3e18HaZjHZrFJu0MyLZgZ9H58SYNRxtU
0gqea0UH2hIoYstatSwVdlFczVsCAwEAAaOBrTCBqjAdBgNVHQ4EFgQUrgxDTfpH
pe4MR6iKOiljfd2IhN8wDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAWgBSZj4as3KW9
SuK2TQ6WHDOVyhv+zTARBgNVHSAECjAIMAYGBFUdIAAwDgYDVR0PAQH/BAQDAgWg
MB0GA1UdJQQWMBQGCCsGAQUFBwMCBggrBgEFBQcDATAYBgNVHREEETAPgg1hZG1p
bi50dW5zaWduMA0GCSqGSIb3DQEBCwUAA4ICAQAtzhFGZLmP1lrXmC/cxhifBz4e
kmZfEK+Akl5pA60XSqjB4SnKlLrk7R/BMBc0iQPIJbSiR3BSLl8NmGwMe7PopdV3
VL5oUORgYU4m5P45jjjuecEJtl3A+W0v/tF9O/Nc1MICC08/AroenP9cxCyYRxsq
VfbPBjSrBG9v2wqDd2h0cZXF9P/BXL0ZDDdAgtuvvQOFVTwXCZHIvUCgqW85URlG
Zm8HVSQ3WCLH3+cBzGiPPdQOugp9fOQ3mkef0tCqTJefEXvdeua/1DOVFSnqNYQc
DggkHDyEH9X6cMPvRdiMKj1qs5Yv5AIp9djdKUNdpq1ik3SYKnKPHqu/JDBCf3sH
BOmrU4nItas2qTOUm+rMNbkb8Onim6wLVTnTE4Vzu6K/b0QI1nEsenHHPXCYFuz0
oemEKQ+242HwIxBu+guPpaTw60FW6qqE9oyBpTKp20/HAvVpSrKbdUdWOHvJCt2z
m7n+3nzNUI82YEGBK8VjFt9eomsHH6y0XGeFYx5JnOVaGXT38domAFYm2+Cvq43U
QcgJpUHt0m2fBA0IDYLBE38nyNaXP3s9rH5j8areaFdMrMB8Ytls9TaxRdbNBlZI
sazLa1H32wQAbmZU3mxY2pkkEVESIyx/TX/V79WZSpAiv1EDP1AGmo4D9ICreVen
U0tFLIWm4YnavH04TQ==
-----END CERTIFICATE-----`;

function buildAgent() {
  const proxy = ttnProxyUrl();
  if (proxy) return new HttpsProxyAgent(proxy);
  if (digigoAllowInsecure()) return new https.Agent({ rejectUnauthorized: false });
  return undefined;
}

async function httpGetJson(url: string) {
  const agent = buildAgent();

  const res = await fetch(url, { method: "GET", agent: agent as any } as any);
  const txt = await res.text();

  let data: any = txt;
  try {
    data = JSON.parse(txt);
  } catch {}

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP_${res.status}`;
    const e: any = new Error(msg);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

async function httpPostJson(url: string, body: any) {
  const agent = buildAgent();

  const res = await fetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      agent: agent as any,
    } as any
  );

  const txt = await res.text();

  let data: any = txt;
  try {
    data = JSON.parse(txt);
  } catch {}

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || `HTTP_${res.status}`;
    const e: any = new Error(msg);
    e.status = res.status;
    e.data = data;
    throw e;
  }
  return data;
}

function b64urlToBuf(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const x = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(x, "base64");
}

function b64urlToJson(s: string) {
  return JSON.parse(b64urlToBuf(s).toString("utf8"));
}

export function verifyAndDecodeJwt(token: string) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("JWT_INVALID");

  const [h, p, sig] = parts;

  const header = b64urlToJson(h);
  const payload = b64urlToJson(p);

  const signed = Buffer.from(`${h}.${p}`, "utf8");
  const signature = b64urlToBuf(sig);

  const v = crypto.createVerify("RSA-SHA256");
  v.update(signed);
  v.end();

  const ok = v.verify(NDCA_JWT_VERIFY_CERT_PEM, signature);
  if (!ok) throw new Error("JWT_SIGNATURE_INVALID");

  return { header, payload };
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function digigoAuthorizeUrl(input: {
  credentialId: string;
  hashBase64: string;
  numSignatures?: number;
  state: string;
}) {
  const base = digigoBaseUrl();

  const u = new URL(`${base}/tunsign-proxy-webapp/oauth2/authorize`);
  u.searchParams.set("redirectUri", digigoRedirectUri());

  u.searchParams.set("responseType", "code");
  u.searchParams.set("scope", "credential");
  u.searchParams.set("credentialId", input.credentialId);
  u.searchParams.set("clientId", digigoClientId());
  u.searchParams.set("numSignatures", String(input.numSignatures ?? 1));
  u.searchParams.set("hash", input.hashBase64);

  return u.toString();
}

export async function digigoExchangeTokenForSad(authorizationJwtTokenOrCode: string) {
  const base = digigoBaseUrl();
  const clientId = digigoClientId();
  const grantType = digigoGrantType();
  const clientSecret = digigoClientSecret();

  const raw = String(authorizationJwtTokenOrCode || "").trim();
  let jti = "";
  let payload: any = null;

  if (raw.split(".").length === 3) {
    const decoded = verifyAndDecodeJwt(raw);
    payload = decoded.payload;
    jti = String((payload as any)?.jti ?? "").trim();
  } else {
    jti = raw;
  }
  if (!jti) {
    const e: any = new Error("JWT_JTI_MISSING");
    e.data = payload;
    throw e;
  }

  const url = `${base}/tunsign-proxy-webapp/services/v1/oauth2/token/${encodeURIComponent(
    clientId
  )}/${encodeURIComponent(grantType)}/${encodeURIComponent(clientSecret)}/${encodeURIComponent(jti)}`;

  try {
    return await httpPostJson(url, { redirectUri: digigoRedirectUri() });
  } catch (e: any) {
    const st = Number(e?.status ?? 0);
    if (st === 404 || st === 405) {
      return httpGetJson(url);
    }
    throw e;
  }
}

export async function digigoSignHash(input: {
  credentialId: string;
  sad: string;
  hashAlgo: string;
  signAlgo: string;
  hashesBase64: string[];
}) {
  const base = digigoBaseUrl();
  const clientId = digigoClientId();

  const url = `${base}/tunsign-proxy-webapp/services/v1/signatures/signHash/${encodeURIComponent(
    clientId
  )}/${encodeURIComponent(input.credentialId)}/${encodeURIComponent(input.sad)}/${encodeURIComponent(
    input.hashAlgo
  )}/${encodeURIComponent(input.signAlgo)}`;

  return httpPostJson(url, { hash: input.hashesBase64 });
}
