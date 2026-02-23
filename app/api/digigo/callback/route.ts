import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeJwtPayload } from "@/lib/digigo/jwt";
import { digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/crypto/sha256";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = s(url.searchParams.get("token"));
  if (!token) return NextResponse.redirect(new URL("/digigo/redirect?error=MISSING_TOKEN", url.origin));
  return NextResponse.redirect(new URL(`/digigo/redirect?token=${encodeURIComponent(token)}`, url.origin));
}

export async function POST(req: Request) {
  const admin = createAdminClient();
  const body = await req.json().catch(() => ({}));
  const token = s(body?.token);

  if (!token) return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });

  const payload = decodeJwtPayload(token);
  const jti = s(payload?.jti);
  const sub = s(payload?.sub);

  if (!jti) return NextResponse.json({ error: "MISSING_JTI" }, { status: 400 });
  if (!sub) return NextResponse.json({ error: "MISSING_SUB" }, { status: 400 });

  const { data: sess, error: sessErr } = await admin
    .from("digigo_sign_sessions")
    .select("id, invoice_id, state, back_url, status, expires_at, environment, company_id, created_at")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessErr) return NextResponse.json({ error: "SESSION_LOOKUP_FAILED", details: sessErr.message }, { status: 500 });
  if (!sess?.invoice_id) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

  const { data: sig, error: sigErr } = await admin
    .from("invoice_signatures")
    .select("id, invoice_id, unsigned_xml, unsigned_hash, meta, environment, company_id, signed_xml")
    .eq("invoice_id", sess.invoice_id)
    .eq("provider", "digigo")
    .eq("environment", sess.environment)
    .maybeSingle();

  if (sigErr) return NextResponse.json({ error: "SIGNATURE_LOOKUP_FAILED", details: sigErr.message }, { status: 500 });
  if (!sig) return NextResponse.json({ error: "SIGNATURE_NOT_FOUND" }, { status: 404 });

  if (sig.signed_xml) {
    return NextResponse.json({
      ok: true,
      invoice_id: sig.invoice_id,
      back_url: s(sig?.meta?.back_url) || `/invoices/${sig.invoice_id}`,
      already_signed: true,
    });
  }

  const credentialId = s(sig?.meta?.credentialId) || sub;
  if (!credentialId) return NextResponse.json({ error: "MISSING_CREDENTIAL_ID" }, { status: 400 });

  const unsignedXml = s(sig.unsigned_xml);
  const unsignedHash = s(sig.unsigned_hash);

  if (!unsignedXml) return NextResponse.json({ error: "MISSING_XML" }, { status: 400 });
  if (!unsignedHash) return NextResponse.json({ error: "MISSING_HASH" }, { status: 400 });

  const oauth = await digigoOauthTokenFromJti({ jti });
  const signRes = await digigoSignHash({
    sad: s(oauth?.sad),
    credentialId,
    hashesBase64: [unsignedHash],
    hashAlgo: "SHA256",
    signAlgo: "RSA",
  });

  const signatureValue = s(signRes?.value);

  const signedXml = injectSignatureIntoTeifXml(unsignedXml, signatureValue);
  const signedHash = sha256Base64Utf8(signedXml);
  const nowIso = new Date().toISOString();

  const { error: updSessErr } = await admin
    .from("digigo_sign_sessions")
    .update({ status: "done", digigo_jti: jti, updated_at: nowIso })
    .eq("id", sess.id);

  if (updSessErr) return NextResponse.json({ error: "SESSION_UPDATE_FAILED", details: updSessErr.message }, { status: 500 });

  const { error: updSigErr } = await admin
    .from("invoice_signatures")
    .update({
      state: "done",
      signed_xml: signedXml,
      signed_hash: signedHash,
      signed_at: nowIso,
      updated_at: nowIso,
      meta: { ...(sig.meta || {}), digigo_jti: jti, credentialId },
    })
    .eq("id", sig.id);

  if (updSigErr) return NextResponse.json({ error: "SIGNATURE_UPDATE_FAILED", details: updSigErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    invoice_id: sig.invoice_id,
    back_url: s(sig?.meta?.back_url) || `/invoices/${sig.invoice_id}`,
    digigo_jti: jti,
  });
}
