import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAuthorizeUrl, sha256Base64Utf8, DigigoEnv } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function uuid() {
  return crypto.randomUUID();
}

function addMinutes(min: number) {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

async function resolveCredentialId(service: any, companyId: string, env: "test" | "production") {
  let r = await service
    .from("ttn_credentials")
    .select("signature_config, updated_at, environment, is_active")
    .eq("company_id", companyId)
    .eq("environment", env)
    .order("updated_at", { ascending: false })
    .limit(1);

  let cfg: any = r.data?.[0]?.signature_config || {};
  let credentialId = s(cfg?.digigo_signer_email || cfg?.credentialId || cfg?.email || "");

  if (!credentialId) {
    const other = env === "test" ? "production" : "test";
    r = await service
      .from("ttn_credentials")
      .select("signature_config, updated_at, environment, is_active")
      .eq("company_id", companyId)
      .eq("environment", other)
      .order("updated_at", { ascending: false })
      .limit(1);

    cfg = r.data?.[0]?.signature_config || {};
    credentialId = s(cfg?.digigo_signer_email || cfg?.credentialId || cfg?.email || "");
  }

  if (!credentialId) {
    r = await service
      .from("ttn_credentials")
      .select("signature_config, updated_at, environment, is_active")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    cfg = r.data?.[0]?.signature_config || {};
    credentialId = s(cfg?.digigo_signer_email || cfg?.credentialId || cfg?.email || "");
  }

  return credentialId;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const service = createServiceClient();
  const supabase = await createClient();

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body?.invoice_id || body?.invoiceId || "");
  const back_url = s(body?.back_url || body?.backUrl || body?.back || "");
  const host = s(req.headers.get("host") || "");
  const inferredEnv: "test" | "production" = host.includes("facturetn.com") ? "production" : "test";
  const environment = (s(body?.environment) as any) || inferredEnv;

  if (!invoice_id) return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });

  const inv = await service.from("invoices").select("id, company_id").eq("id", invoice_id).maybeSingle();
  if (!inv.data?.id) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const sig = await service
    .from("invoice_signatures")
    .select("unsigned_xml, unsigned_hash")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  const unsigned_xml = s(sig.data?.unsigned_xml || "");
  let unsigned_hash = s(sig.data?.unsigned_hash || "");
  if (!unsigned_hash && unsigned_xml) unsigned_hash = sha256Base64Utf8(unsigned_xml);
  if (!unsigned_hash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

  const credentialId = await resolveCredentialId(service, inv.data.company_id, environment);
  if (!credentialId) return NextResponse.json({ ok: false, error: "DIGIGO_SIGNER_EMAIL_NOT_CONFIGURED" }, { status: 400 });

  const state = uuid();
  const expires_at = addMinutes(10);
  const backUrlFinal = back_url || `/invoices/${invoice_id}`;

  await service.from("digigo_sign_sessions").insert({
    state,
    invoice_id,
    company_id: inv.data.company_id,
    created_by: user.id,
    back_url: backUrlFinal,
    status: "pending",
    environment,
    expires_at,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await service.from("invoice_signatures").upsert({
    invoice_id,
    provider: "digigo",
    state: "pending",
    unsigned_xml: unsigned_xml || null,
    unsigned_hash,
    signer_user_id: user.id,
    company_id: inv.data.company_id,
    environment,
    meta: { credentialId, state, environment },
    updated_at: new Date().toISOString(),
  });

  cookieStore.set("digigo_state", state, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
  cookieStore.set("digigo_invoice_id", invoice_id, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
  cookieStore.set("digigo_back_url", backUrlFinal, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });

  const authorize_url = digigoAuthorizeUrl({
    state,
    hash: unsigned_hash,
    credentialId,
    numSignatures: 1,
    environment: environment === "production" ? ("PROD" as DigigoEnv) : ("TEST" as DigigoEnv),
  });

  return NextResponse.json({ ok: true, authorize_url, state, invoice_id, back_url: backUrlFinal });
}
