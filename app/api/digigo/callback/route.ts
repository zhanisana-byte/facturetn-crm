import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeJwtPayload } from "@/lib/digigo/jwt";
import { digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/crypto/sha256";

function s(v: any) {
  return String(v ?? "").trim();
}

function jsonError(error: string, status: number, details?: any) {
  return NextResponse.json({ ok: false, error, ...(details ? { details } : {}) }, { status });
}

function safeBackUrl(origin: string, sessBackUrl?: string, sigBackUrl?: string, invoiceId?: string) {
  const raw = s(sessBackUrl) || s(sigBackUrl) || (invoiceId ? `/invoices/${invoiceId}` : "/");
  try {
    return new URL(raw, origin).toString();
  } catch {
    return raw.startsWith("/") ? `${origin}${raw}` : `${origin}/`;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = s(url.searchParams.get("token"));
  const state = s(url.searchParams.get("state"));
  const err = s(url.searchParams.get("error"));

  if (!token) {
    const red = new URL(`/digigo/redirect?error=${encodeURIComponent(err || "MISSING_TOKEN")}`, url.origin);
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
  const invoiceIdFromBody = s(body?.invoice_id || body?.invoiceId);

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

  let sess: any = null;

  if (state) {
    const r = await admin
      .from("digigo_sign_sessions")
      .select("id, invoice_id, state, back_url, status, expires_at, environment, company_id, created_by, created_at, error_message")
      .eq("state", state)
      .maybeSingle();

    if (r.error) return jsonError("SESSION_LOOKUP_FAILED", 500, r.error.message);
    sess = r.data;
  } else if (invoiceIdFromBody) {
    const r = await admin
      .from("digigo_sign_sessions")
      .select("id, invoice_id, state, back_url, status, expires_at, environment, company_id, created_by, created_at, error_message")
      .eq("invoice_id", invoiceIdFromBody)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (r.error) return jsonError("SESSION_LOOKUP_FAILED", 500, r.error.message);
    sess = r.data;
  }

  if (!sess?.invoice_id) {
    return jsonError("SESSION_NOT_FOUND", 404, {
      hint: "Provide state (preferred) or invoice_id from localStorage",
    });
  }

  const invoiceId = s(sess.invoice_id);
  const env = s(sess.environment) || "production";
  const companyId = s(sess.company_id) || null;

  if (s(sess.status) === "done") {
    const origin = new URL(req.url).origin;

    const { data: sig2 } = await admin
      .from("invoice_signatures")
      .select("meta")
      .eq("invoice_id", invoiceId)
      .eq("provider", "digigo")
      .eq("environment", env)
      .maybeSingle();

    const backUrl = safeBackUrl(origin, s(sess.back_url), s((sig2 as any)?.meta?.back_url), invoiceId);
    return NextResponse.json({ ok: true, invoice_id: invoiceId, back_url: backUrl, already_done: true });
  }

  if (s(sess.expires_at) && s(sess.expires_at) <= nowIso) {
    await admin
      .from("digigo_sign_sessions")
      .update({ status: "expired", updated_at: nowIso })
      .eq("id", sess.id);
    return jsonError("SESSION_EXPIRED", 400);
  }

  const { data: sig, error: sigErr } = await admin
    .from("invoice_signatures")
    .select("id, invoice_id, unsigned_xml, unsigned_hash, meta, environment, company_id, signed_xml")
    .eq("invoice_id", invoiceId)
    .eq("provider", "digigo")
    .eq("environment", env)
    .maybeSingle();

  if (sigErr) return jsonError("SIGNATURE_LOOKUP_FAILED", 500, sigErr.message);
  if (!sig) return jsonError("SIGNATURE_NOT_FOUND", 404);

  const origin = new URL(req.url).origin;
  const meta = sig.meta && typeof sig.meta === "object" ? sig.meta : {};
  const backUrl = safeBackUrl(origin, s(sess.back_url), s((meta as any)?.back_url), invoiceId);

  if (sig.signed_xml) {
    await admin
      .from("digigo_sign_sessions")
      .update({ status: "done", digigo_jti: jti, error_message: null, updated_at: nowIso })
      .eq("id", sess.id);

    return NextResponse.json({ ok: true, invoice_id: invoiceId, back_url: backUrl, already_signed: true });
  }

  const credentialId = s((meta as any)?.credentialId) || sub;
  if (!credentialId) return jsonError("MISSING_CREDENTIAL_ID", 400);

  const unsignedXml = s(sig.unsigned_xml);
  const unsignedHash = s(sig.unsigned_hash);
  if (!unsignedXml) return jsonError("MISSING_XML", 400);
  if (!unsignedHash) return jsonError("MISSING_HASH", 400);

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
      digigo_jti: jti,
      credentialId,
      back_url: s((meta as any)?.back_url) || s(sess.back_url) || backUrl,
      digigo_state: s(sess.state),
      digigo_sub: sub,
    };

    const { error: updSigErr } = await admin
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_xml: signedXml,
        signed_hash: signedHash,
        signed_at: nowIso,
        updated_at: nowIso,
        meta: newMeta,
        company_id: (sig as any).company_id || companyId || undefined,
      })
      .eq("id", sig.id);

    if (updSigErr) return jsonError("SIGNATURE_UPDATE_FAILED", 500, updSigErr.message);

    const { error: updSessErr } = await admin
      .from("digigo_sign_sessions")
      .update({ status: "done", digigo_jti: jti, error_message: null, updated_at: nowIso })
      .eq("id", sess.id);

    if (updSessErr) return jsonError("SESSION_UPDATE_FAILED", 500, updSessErr.message);

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

    return NextResponse.json({ ok: true, invoice_id: invoiceId, back_url: backUrl, digigo_jti: jti });
  } catch (e: any) {
    const msg = s(e?.message) || "UNKNOWN_ERROR";
    await admin
      .from("digigo_sign_sessions")
      .update({ status: "failed", error_message: msg, updated_at: nowIso })
      .eq("id", sess.id);

    return jsonError("DIGIGO_CALLBACK_FAILED", 500, msg);
  }
}
