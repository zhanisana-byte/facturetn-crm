import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeJwtPayload } from "@/lib/digigo/jwt";
import { digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/crypto/sha256";

function s(v: any) {
  return String(v ?? "").trim();
}

function jsonError(
  error: string,
  status: number,
  details?: any,
  extra?: Record<string, any>
) {
  return NextResponse.json(
    { ok: false, error, ...(details ? { details } : {}), ...(extra || {}) },
    { status }
  );
}

function safeBackUrl(
  origin: string,
  sessBackUrl?: string,
  sigBackUrl?: string,
  invoiceId?: string
) {
  const raw =
    s(sessBackUrl) || s(sigBackUrl) || (invoiceId ? `/invoices/${invoiceId}` : "/");
  try {
    const u = new URL(raw, origin);
    return u.toString();
  } catch {
    return raw.startsWith("/") ? `${origin}${raw}` : `${origin}/`;
  }
}

async function markSessionFailedByState(admin: any, state: string, message: string) {
  const st = s(state);
  if (!st) return;
  await admin
    .from("digigo_sign_sessions")
    .update({
      status: "failed",
      error_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("state", st)
    .eq("status", "pending");
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const token = s(url.searchParams.get("token"));
  const state = s(url.searchParams.get("state"));
  const error = s(url.searchParams.get("error"));

  if (!token) {
    const red = new URL(
      `/digigo/redirect?error=${encodeURIComponent(error || "MISSING_TOKEN")}`,
      url.origin
    );
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
  if (!state) return jsonError("MISSING_STATE", 400);

  let jti = "";
  let sub = "";

  try {
    const payload = decodeJwtPayload(token);
    jti = s(payload?.jti);
    sub = s(payload?.sub);
  } catch (e: any) {
    await markSessionFailedByState(admin, state, `JWT_DECODE_FAILED: ${s(e?.message) || "unknown"}`);
    return jsonError("JWT_DECODE_FAILED", 400);
  }

  if (!jti) {
    await markSessionFailedByState(admin, state, "MISSING_JTI");
    return jsonError("MISSING_JTI", 400);
  }
  if (!sub) {
    await markSessionFailedByState(admin, state, "MISSING_SUB");
    return jsonError("MISSING_SUB", 400);
  }

  const { data: sess, error: sessErr } = await admin
    .from("digigo_sign_sessions")
    .select(
      "id, invoice_id, state, back_url, status, expires_at, environment, company_id, created_at, updated_at, digigo_jti, error_message"
    )
    .eq("state", state)
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (sessErr) return jsonError("SESSION_LOOKUP_FAILED", 500, sessErr.message);
  if (!sess?.invoice_id) return jsonError("SESSION_NOT_FOUND", 404, null, { state });

  const invoiceId = s(sess.invoice_id);
  const env = s(sess.environment) || "test";
  const companyId = s(sess.company_id) || null;

  const { data: sig, error: sigErr } = await admin
    .from("invoice_signatures")
    .select(
      "id, invoice_id, provider, state, unsigned_xml, unsigned_hash, signed_xml, signed_hash, meta, environment, company_id, error_message"
    )
    .eq("invoice_id", invoiceId)
    .eq("provider", "digigo")
    .eq("environment", env)
    .maybeSingle();

  if (sigErr) {
    await markSessionFailedByState(admin, state, `SIGNATURE_LOOKUP_FAILED: ${s(sigErr.message)}`);
    return jsonError("SIGNATURE_LOOKUP_FAILED", 500, sigErr.message);
  }
  if (!sig) {
    await markSessionFailedByState(admin, state, "SIGNATURE_NOT_FOUND");
    return jsonError("SIGNATURE_NOT_FOUND", 404, null, { invoice_id: invoiceId });
  }

  const origin = new URL(req.url).origin;
  const meta = sig.meta && typeof sig.meta === "object" ? sig.meta : {};
  const metaBackUrl = s((meta as any)?.back_url);
  const backUrl = safeBackUrl(origin, s(sess.back_url), metaBackUrl, invoiceId);

  if (s(sig.signed_xml)) {
    await admin
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        digigo_jti: jti,
        error_message: null,
        updated_at: nowIso,
      })
      .eq("id", sess.id);

    return NextResponse.json({
      ok: true,
      invoice_id: invoiceId,
      back_url: backUrl,
      already_signed: true,
    });
  }

  const unsignedXml = s(sig.unsigned_xml);
  const unsignedHash = s(sig.unsigned_hash);

  if (!unsignedXml) {
    await markSessionFailedByState(admin, state, "MISSING_XML");
    return jsonError("MISSING_XML", 400);
  }
  if (!unsignedHash) {
    await markSessionFailedByState(admin, state, "MISSING_HASH");
    return jsonError("MISSING_HASH", 400);
  }

  const credentialId = s((meta as any)?.credentialId) || sub;
  if (!credentialId) {
    await markSessionFailedByState(admin, state, "MISSING_CREDENTIAL_ID");
    return jsonError("MISSING_CREDENTIAL_ID", 400);
  }

  try {
    const oauth = await digigoOauthTokenFromJti({ jti });
    const sad = s((oauth as any)?.sad);
    if (!sad) {
      await markSessionFailedByState(admin, state, "OAUTH_SAD_MISSING");
      return jsonError("OAUTH_SAD_MISSING", 500);
    }

    const signRes = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
      hashAlgo: "SHA256",
      signAlgo: "RSA",
    });

    const signatureValue = s((signRes as any)?.value);
    if (!signatureValue) {
      await markSessionFailedByState(admin, state, "SIGNATURE_VALUE_MISSING");
      return jsonError("SIGNATURE_VALUE_MISSING", 500);
    }

    const signedXml = injectSignatureIntoTeifXml(unsignedXml, signatureValue);
    const signedHash = sha256Base64Utf8(signedXml);

    const { error: updSessErr } = await admin
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        digigo_jti: jti,
        error_message: null,
        updated_at: nowIso,
      })
      .eq("id", sess.id);

    if (updSessErr) return jsonError("SESSION_UPDATE_FAILED", 500, updSessErr.message);

    const newMeta = {
      ...(meta || {}),
      back_url: metaBackUrl || s(sess.back_url) || backUrl,
      credentialId,
      digigo_jti: jti,
      digigo_sub: sub,
      digigo_state: state,
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
      .from("invoices")
      .update({
        signature_status: "signed",
        signature_provider: "digigo",
        ttn_signed: true,
        signed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", invoiceId);

    return NextResponse.json({
      ok: true,
      invoice_id: invoiceId,
      back_url: backUrl,
      jti,
      environment: env,
    });
  } catch (e: any) {
    const msg = s(e?.message) || "UNKNOWN_ERROR";
    await markSessionFailedByState(admin, state, msg);
    return jsonError("DIGIGO_CALLBACK_FAILED", 500, msg);
  }
}
