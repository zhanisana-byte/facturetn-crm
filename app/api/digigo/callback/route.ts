import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeJwtPayload } from "@/lib/digigo/jwt";
import { digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/crypto/sha256";

function s(v: any) {
  return String(v ?? "").trim();
}

function jsonError(error: string, status: number, details?: any, extra?: Record<string, any>) {
  return NextResponse.json(
    { ok: false, error, ...(details ? { details } : {}), ...(extra || {}) },
    { status }
  );
}

function safeBackUrl(origin: string, sessBackUrl?: string, sigBackUrl?: string, invoiceId?: string) {
  const raw = s(sessBackUrl) || s(sigBackUrl) || (invoiceId ? `/invoices/${invoiceId}` : "/");
  try {
    return new URL(raw, origin).toString();
  } catch {
    return raw.startsWith("/") ? `${origin}${raw}` : `${origin}/`;
  }
}

async function lookupUserIdByEmail(admin: any, email: string) {
  const em = s(email).toLowerCase();
  if (!em) return null;
  const { data, error } = await admin
    .from("app_users")
    .select("id,email")
    .ilike("email", em)
    .maybeSingle();
  if (!error && data?.id) return data.id;
  const { data: au, error: auErr } = await admin
    .from("auth.users")
    .select("id,email")
    .ilike("email", em)
    .maybeSingle();
  if (auErr) return null;
  return au?.id || null;
}

async function lookupSession(admin: any, state: string, userId: string | null) {
  const nowIso = new Date().toISOString();

  if (s(state)) {
    const { data, error } = await admin
      .from("digigo_sign_sessions")
      .select("*")
      .eq("state", s(state))
      .maybeSingle();
    if (error) return { session: null, error: { code: "SESSION_LOOKUP_FAILED", message: error.message } };
    return { session: data, error: null };
  }

  if (!userId) return { session: null, error: { code: "MISSING_USER_FOR_FALLBACK", message: "No userId" } };

  const { data, error } = await admin
    .from("digigo_sign_sessions")
    .select("*")
    .eq("status", "pending")
    .eq("created_by", userId)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { session: null, error: { code: "SESSION_FALLBACK_FAILED", message: error.message } };
  return { session: data, error: null };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = s(url.searchParams.get("token"));
  const state = s(url.searchParams.get("state"));
  const error = s(url.searchParams.get("error"));

  if (!token) {
    const red = new URL(`/digigo/redirect?error=${encodeURIComponent(error || "MISSING_TOKEN")}`, url.origin);
    if (state) red.searchParams.set("state", state);
    return NextResponse.redirect(red);
  }

  const red = new URL(`/digigo/redirect?token=${encodeURIComponent(token)}`, url.origin);
  if (state) red.searchParams.set("state", state);
  return NextResponse.redirect(red);
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const body = await req.json().catch(() => ({}));
  const token = s(body?.token);
  const state = s(body?.state);

  if (!token) return jsonError("MISSING_TOKEN", 400);

  let jti = "";
  let sub = "";

  try {
    const payload = decodeJwtPayload(token);
    jti = s(payload?.jti);
    sub = s(payload?.sub);
  } catch (e: any) {
    return jsonError("JWT_DECODE_FAILED", 400, s(e?.message) || "unknown");
  }

  if (!jti) return jsonError("MISSING_JTI", 400);
  if (!sub) return jsonError("MISSING_SUB", 400);

  const userId = await lookupUserIdByEmail(admin, sub);

  const { session, error: sessLookupErr } = await lookupSession(admin, state, userId);

  if (sessLookupErr) return jsonError(sessLookupErr.code, 500, sessLookupErr.message);
  if (!session?.invoice_id) return jsonError("SESSION_NOT_FOUND", 404, null, { state: state || null });

  if (s(session.status) === "done") {
    const origin = new URL(req.url).origin;
    const backUrl = safeBackUrl(origin, s(session.back_url), "", s(session.invoice_id));
    return NextResponse.json({ ok: true, invoice_id: s(session.invoice_id), back_url: backUrl, already_done: true });
  }

  if (s(session.status) === "expired" || (session.expires_at && s(session.expires_at) <= nowIso)) {
    return jsonError("SESSION_EXPIRED", 400);
  }

  const invoiceId = s(session.invoice_id);
  const env = s(session.environment) || "test";
  const companyId = s(session.company_id) || null;

  const { data: sig, error: sigErr } = await admin
    .from("invoice_signatures")
    .select("id, invoice_id, provider, state, unsigned_xml, unsigned_hash, signed_xml, signed_hash, meta, environment, company_id, error_message")
    .eq("invoice_id", invoiceId)
    .eq("provider", "digigo")
    .eq("environment", env)
    .maybeSingle();

  if (sigErr) {
    await admin
      .from("digigo_sign_sessions")
      .update({ status: "failed", error_message: `SIGNATURE_LOOKUP_FAILED: ${s(sigErr.message)}`, updated_at: nowIso })
      .eq("id", session.id);
    return jsonError("SIGNATURE_LOOKUP_FAILED", 500, sigErr.message);
  }

  if (!sig) {
    await admin
      .from("digigo_sign_sessions")
      .update({ status: "failed", error_message: "SIGNATURE_NOT_FOUND", updated_at: nowIso })
      .eq("id", session.id);
    return jsonError("SIGNATURE_NOT_FOUND", 404);
  }

  const origin = new URL(req.url).origin;
  const meta = sig.meta && typeof sig.meta === "object" ? sig.meta : {};
  const metaBackUrl = s((meta as any)?.back_url);
  const backUrl = safeBackUrl(origin, s(session.back_url), metaBackUrl, invoiceId);

  if (s(sig.signed_xml)) {
    await admin
      .from("digigo_sign_sessions")
      .update({ status: "done", digigo_jti: jti, error_message: null, updated_at: nowIso })
      .eq("id", session.id);

    return NextResponse.json({ ok: true, invoice_id: invoiceId, back_url: backUrl, already_signed: true });
  }

  const unsignedXml = s(sig.unsigned_xml);
  const unsignedHash = s(sig.unsigned_hash);
  if (!unsignedXml) return jsonError("MISSING_XML", 400);
  if (!unsignedHash) return jsonError("MISSING_HASH", 400);

  const credentialId = s((meta as any)?.credentialId) || sub;
  if (!credentialId) return jsonError("MISSING_CREDENTIAL_ID", 400);

  try {
    const oauth = await digigoOauthTokenFromJti({ jti });
    const sad = s((oauth as any)?.sad);
    if (!sad) return jsonError("OAUTH_SAD_MISSING", 500);

    const signRes = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
      hashAlgo: "SHA256",
      signAlgo: "RSA",
    });

    const signatureValue = s((signRes as any)?.value);
    if (!signatureValue) return jsonError("SIGNATURE_VALUE_MISSING", 500);

    const signedXml = injectSignatureIntoTeifXml(unsignedXml, signatureValue);
    const signedHash = sha256Base64Utf8(signedXml);

    const newMeta = {
      ...(meta || {}),
      back_url: metaBackUrl || s(session.back_url) || backUrl,
      credentialId,
      digigo_jti: jti,
      digigo_sub: sub,
      digigo_state: s(session.state),
    };

    const { error: updSigErr } = await admin
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_xml: signedXml,
        signed_hash: signedHash,
        signed_at: nowIso,
        updated_at: nowIso,
        error_message: null,
        meta: newMeta,
        environment: env,
        company_id: (sig as any).company_id || companyId || undefined,
      })
      .eq("invoice_id", invoiceId);

    if (updSigErr) return jsonError("SIGNATURE_UPDATE_FAILED", 500, updSigErr.message);

    await admin
      .from("digigo_sign_sessions")
      .update({ status: "done", digigo_jti: jti, error_message: null, updated_at: nowIso })
      .eq("id", session.id);

    await admin
      .from("invoices")
      .update({
        signature_status: "signed",
        signature_provider: "digigo",
        ttn_signed: true,
        signed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", invoiceId);

    return NextResponse.json({ ok: true, invoice_id: invoiceId, back_url: backUrl, jti, environment: env });
  } catch (e: any) {
    const msg = s(e?.message) || "UNKNOWN_ERROR";
    await admin
      .from("digigo_sign_sessions")
      .update({ status: "failed", error_message: msg, updated_at: nowIso })
      .eq("id", session.id);
    return jsonError("DIGIGO_CALLBACK_FAILED", 500, msg);
  }
}
