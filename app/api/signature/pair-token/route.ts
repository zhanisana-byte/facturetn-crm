import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

function pickFirstHeader(h: Headers, key: string) {
  return (h.get(key) || "").split(",")[0].trim();
}

function buildServerOrigin(req: Request, environment: "test" | "production") {
  const h = new Headers(req.headers);

  const proto = pickFirstHeader(h, "x-forwarded-proto") || "https";
  const host =
    pickFirstHeader(h, "x-forwarded-host") ||
    pickFirstHeader(h, "host");

  const fromHeaders = host ? `${proto}://${host}` : "";
  const fromEnv = s(process.env.APP_URL); // ✅ server-only
  const fromReq = new URL(req.url).origin;

  // ✅ priorité: headers (prod/vercel) → APP_URL → req.url origin
  let origin = (fromHeaders || fromEnv || fromReq).replace(/\/$/, "");

  // ✅ Sécurité: en production, on refuse localhost
  if (environment === "production" && /localhost|127\.0\.0\.1/i.test(origin)) {
    origin = "https://facturetn.com";
  }

  return origin;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const company_id = s(body.company_id);

  // ✅ compat: certains clients envoient "environment", d'autres "env"
  const environment = (s(body.environment || body.env) || "production") as "test" | "production";

  if (!company_id) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const ok = await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn");
  if (!ok) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const token = crypto.randomUUID();
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error } = await supabase.from("signature_pair_tokens").insert({
    token,
    company_id,
    environment,
    created_by: auth.user.id,
    expires_at,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ✅ ORIGIN correct (facturetn.com en prod, localhost en dev)
  const server = buildServerOrigin(req, environment);
  if (!server) {
    return NextResponse.json({ error: "SERVER_URL_MISSING" }, { status: 500 });
  }

  const scheme = (process.env.AGENT_DEEPLINK_SCHEME || "facturetn-agent").trim();

  const deepLinkUrl =
    `${scheme}://pair` +
    `?server=${encodeURIComponent(server)}` +
    `&token=${encodeURIComponent(token)}` +
    `&company_id=${encodeURIComponent(company_id)}` +
    `&env=${encodeURIComponent(environment)}`;

  return NextResponse.json({ ok: true, token, deepLinkUrl, expires_at });
}
