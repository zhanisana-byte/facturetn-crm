import crypto from "crypto";

export type DigigoEnv = "test" | "production";

function clean(v?: string | null) {
  const x = (v ?? "").trim();
  return x.length ? x : null;
}

function must(v: string | null, name: string) {
  if (!v) throw new Error(`MISSING_${name}`);
  return v;
}

function getBaseUrl(env: DigigoEnv) {
  const test = clean(process.env.DIGIGO_BASE_URL_TEST);
  const prod = clean(process.env.DIGIGO_BASE_URL_PROD);
  if (env === "production") return must(prod, "DIGIGO_BASE_URL_PROD");
  return must(test, "DIGIGO_BASE_URL_TEST");
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function digigoAuthorizeUrl(params: {
  env: DigigoEnv;
  clientId: string;
  redirectUri: string;
  state: string;
  credentialId: string;
  hashBase64?: string;
  numSignatures?: number;
}) {
  const base = getBaseUrl(params.env);
  const url = new URL("/oauth2/authorize", base);

  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("credential_id", params.credentialId);

  if (params.hashBase64) url.searchParams.set("hash", params.hashBase64);
  if (params.numSignatures) url.searchParams.set("numSignatures", String(params.numSignatures));

  return url.toString();
}

export async function digigoExchangeCode(params: {
  env: DigigoEnv;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri?: string;
}) {
  const base = getBaseUrl(params.env);

  const redirectUri = clean(params.redirectUri) || clean(process.env.DIGIGO_REDIRECT_URI);
  if (!redirectUri) throw new Error("MISSING_DIGIGO_REDIRECT_URI");

  const res = await fetch(`${base}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: redirectUri,
    }),
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    return { ok: false as const, status: res.status, raw: text, json };
  }

  return { ok: true as const, status: res.status, json: json ?? text };
}
