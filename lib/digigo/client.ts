import crypto from "crypto";

export type DigigoEnv = "test" | "production";

function s(v: any) {
  return String(v ?? "").trim();
}

function clean(v?: string | null) {
  const x = s(v);
  return x.length ? x : null;
}

function must(v: string | null, name: string) {
  if (!v) throw new Error(`MISSING_${name}`);
  return v;
}

function resolveEnv(env?: DigigoEnv): DigigoEnv {
  if (env === "test" || env === "production") return env;
  return clean(process.env.DIGIGO_ENV) === "production" ? "production" : "test";
}

function getBaseUrl(env: DigigoEnv) {
  const anyBase = clean(process.env.DIGIGO_BASE_URL);
  const test = clean(process.env.DIGIGO_BASE_URL_TEST) || anyBase;
  const prod = clean(process.env.DIGIGO_BASE_URL_PROD) || anyBase;

  if (env === "production") return must(prod, "DIGIGO_BASE_URL_PROD");
  return must(test, "DIGIGO_BASE_URL_TEST");
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function digigoAuthorizeUrl(args: {
  env?: DigigoEnv;
  clientId?: string;
  redirectUri?: string;
  credentialId: string;
  hashBase64: string;
  numSignatures?: number;
  state: string;
}) {
  const env = resolveEnv(args.env);

  const base = getBaseUrl(env);
  const clientId = clean(args.clientId) || clean(process.env.DIGIGO_CLIENT_ID);
  const redirectUri = clean(args.redirectUri) || clean(process.env.DIGIGO_REDIRECT_URI);

  if (!clientId) throw new Error("MISSING_DIGIGO_CLIENT_ID");
  if (!redirectUri) throw new Error("MISSING_DIGIGO_REDIRECT_URI");

  const url = new URL("/tunsign-proxy-webapp/oauth2/authorize", base);

  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("responseType", "code");
  url.searchParams.set("scope", "credential");
  url.searchParams.set("credentialId", s(args.credentialId));
  url.searchParams.set("clientId", clientId);

  const n = args.numSignatures ?? 1;
  url.searchParams.set("numSignatures", String(Math.max(1, Math.floor(Number(n) || 1))));

  url.searchParams.set("hash", s(args.hashBase64));
  url.searchParams.set("state", s(args.state));

  return url.toString();
}

export async function digigoExchangeCode(args: {
  env?: DigigoEnv;
  clientId?: string;
  clientSecret?: string;
  code: string;
  redirectUri?: string;
}) {
  const env = resolveEnv(args.env);
  const base = getBaseUrl(env);

  const clientId = clean(args.clientId) || clean(process.env.DIGIGO_CLIENT_ID);
  const clientSecret = clean(args.clientSecret) || clean(process.env.DIGIGO_CLIENT_SECRET);
  const redirectUri = clean(args.redirectUri) || clean(process.env.DIGIGO_REDIRECT_URI);

  if (!clientId) throw new Error("MISSING_DIGIGO_CLIENT_ID");
  if (!clientSecret) throw new Error("MISSING_DIGIGO_CLIENT_SECRET");
  if (!redirectUri) throw new Error("MISSING_DIGIGO_REDIRECT_URI");

  const tokenUrl = new URL("/tunsign-proxy-webapp/oauth2/token", base);

  const res = await fetch(tokenUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: s(args.code),
      clientId,
      clientSecret,
      redirectUri,
    }),
  });

  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }

  if (!res.ok) {
    return { ok: false as const, status: res.status, raw, json };
  }
  return { ok: true as const, status: res.status, json: json ?? raw };
}
