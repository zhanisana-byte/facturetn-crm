import crypto from "crypto";

export type DigigoEnv = "test" | "production";

function clean(v?: string | null) {
  const x = (v ?? "").trim();
  return x.length ? x : null;
}

function getEnv(): DigigoEnv {
  const e = clean(process.env.DIGIGO_ENV);
  return e === "production" ? "production" : "test";
}

function baseUrl(env: DigigoEnv) {
  const test = clean(process.env.DIGIGO_TEST_BASE_URL) || "https://193.95.63.230";
  const prod = clean(process.env.DIGIGO_PROD_BASE_URL) || "https://digigo.tuntrust.tn";
  return env === "production" ? prod : test;
}

export function randomState() {
  return crypto.randomUUID();
}

export function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export function digigoAuthorizeUrl(params: {
  credentialId: string;
  hashBase64: string;
  numSignatures?: number;
  state: string;
}) {
  const env = getEnv();
  const clientId = clean(process.env.DIGIGO_CLIENT_ID);
  const redirectUri = clean(process.env.DIGIGO_REDIRECT_URI);

  if (!clientId || !redirectUri) {
    throw new Error("Missing DIGIGO_CLIENT_ID or DIGIGO_REDIRECT_URI");
  }

  const url = new URL("/tunsign-proxy-webapp/oauth2/login", baseUrl(env));

  url.searchParams.set("clientId", clientId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("credentialId", params.credentialId);
  url.searchParams.set("hashBase64", params.hashBase64);

  const n = params.numSignatures ?? 1;
  url.searchParams.set("numSignatures", String(n));

  return url.toString();
}

export async function digigoExchangeCode(params: {
  code: string;
}) {
  const env = getEnv();
  const clientId = clean(process.env.DIGIGO_CLIENT_ID);
  const clientSecret = clean(process.env.DIGIGO_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    throw new Error("Missing DIGIGO credentials");
  }

  const url = new URL(
    `/tunsign-proxy-webapp/oauth2/token/${encodeURIComponent(clientId)}/authorization_code/${encodeURIComponent(
      clientSecret
    )}/${encodeURIComponent(params.code)}`,
    baseUrl(env)
  );

  const res = await fetch(url.toString(), { method: "POST" });
  const text = await res.text();

  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      raw: text,
      json,
    };
  }

  return {
    ok: true as const,
    status: res.status,
    json: json ?? text,
  };
}
