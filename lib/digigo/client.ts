import crypto from "crypto";

export type DigigoEnv = "test" | "production";

function clean(v?: string | null) {
  const x = (v ?? "").trim();
  return x.length ? x : null;
}

export function digigoBaseUrl(env: DigigoEnv) {
  const test = clean(process.env.DIGIGO_TEST_BASE_URL) || "https://193.95.63.230";
  const prod = clean(process.env.DIGIGO_PROD_BASE_URL) || "https://digigo.tuntrust.tn";
  return env === "production" ? prod : test;
}

export function digigoAuthorizeUrl(params: {
  env: DigigoEnv;
  clientId: string;
  redirectUri: string;
  state: string;
  credentialId: string;
}) {
  const base = digigoBaseUrl(params.env);
  const url = new URL("/tunsign-proxy-webapp/oauth2/login", base);

  url.searchParams.set("clientId", params.clientId);
  url.searchParams.set("redirectUri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("credentialId", params.credentialId);

  return url.toString();
}

export async function digigoExchangeCode(params: {
  env: DigigoEnv;
  clientId: string;
  clientSecret: string;
  code: string;
}) {
  const base = digigoBaseUrl(params.env);
  const url = new URL(
    `/tunsign-proxy-webapp/oauth2/token/${encodeURIComponent(params.clientId)}/authorization_code/${encodeURIComponent(
      params.clientSecret
    )}/${encodeURIComponent(params.code)}`,
    base
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

export function randomState() {
  return crypto.randomBytes(24).toString("hex");
}
