import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoOauthToken, digigoSignHash, jwtGetJti } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/digigo/client";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}
function b64urlToBuf(b64url: string) {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}
function jwtVerifyRs256(token: string, certPem: string) {
  const t = s(token);
  const parts = t.split(".");
  if (parts.length !== 3) return false;
  const data = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const sig = b64urlToBuf(parts[2]);
  try {
    return crypto.verify("RSA-SHA256", data, certPem, sig);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const service = createServiceClient();
  const body = await req.json().catch(() => ({}));

  const token = s(body?.token);
  const codeParam = s(body?.code);
  const stateParam = s(body?.state);
  const backUrlBody = s(body?.back_url ?? body?.backUrl ?? "");

  if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });

  const okJwt = jwtVerifyRs256(token, NDCA_JWT_VERIFY_CERT_PEM);
  if (!okJwt) return NextResponse.json({ ok: false, error: "JWT_INVALID" }, { status: 400 });

  const jti = jwtGetJti(token);
  if (!jti) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });

  const cookieStore = await cookies();
  const stateCookie = s(cookieStore.get("digigo_state")?.value || "");
  const backCookie = s(cookieStore.get("digigo_back_url")?.value || "");

  const state = stateParam || stateCookie || jti;

  if (state !== jti) {
    return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });
  }

  const sessRes = await service
    .from("digigo_sign_sessions")
    .select("id,state,invoice_id,back_url,status,expires_at")
    .eq("state", state)
    .maybeSingle();

  const session: any = sessRes.data;
  if (!session?.id) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });

  const exp = new Date(s(session.expires_at)).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    await service.from("digigo_sign_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
    await service.from("invoice_signatures").update({ state: "expired", error_message: "SESSION_EXPIRED" }).eq("invoice_id", session.invoice_id);
    return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
  }

  const invoiceId = s(session.invoice_id);
  if (!invoiceId) return NextResponse.json({ ok: false, error: "MISSING_CONTEXT" }, { status: 400 });

  const sigRes = await service
    .from("invoice_signatures")
    .select("meta,unsigned_xml,unsigned_hash,state,signed_xml")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (sigRes.error) return NextResponse.json({ ok: false, error: "SIGNATURE_READ_FAILED", message: sigRes.error.message }, { status: 500 });

  const sig: any = sigRes.data;
  if (!sig) return NextResponse.json({ ok: false, error: "SIGNATURE_NOT_FOUND" }, { status: 404 });

  const currentState = s(sig.state);
  if (currentState === "signed" && s(sig.signed_xml)) {
    const back_url = backUrlBody || s(session.back_url) || backCookie || `/invoices/${invoiceId}`;
    const res0 = NextResponse.json({ ok: true, back_url }, { status: 200 });
    res0.cookies.set("digigo_state", "", { path: "/", maxAge: 0 });
    res0.cookies.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
    res0.cookies.set("digigo_back_url", "", { path: "/", maxAge: 0 });
    return res0;
  }

  const meta = sig?.meta && typeof sig.meta === "object" ? sig.meta : {};
  const credentialId = s(meta?.credentialId || meta?.credential_id || meta?.digigo_signer_email || "");
  const unsignedXml = s(sig?.unsigned_xml);
  const unsignedHash = s(sig?.unsigned_hash);

  if (!credentialId) return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
  if (!unsignedXml) return NextResponse.json({ ok: false, error: "UNSIGNED_XML_MISSING" }, { status: 400 });
  if (!unsignedHash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

  const recomputed = sha256Base64Utf8(unsignedXml);
  if (recomputed !== unsignedHash) {
    await service.from("invoice_signatures").update({ state: "failed", error_message: "HASH_MISMATCH" }).eq("invoice_id", invoiceId);
    await service.from("digigo_sign_sessions").update({ status: "failed", error_message: "HASH_MISMATCH", updated_at: new Date().toISOString() }).eq("id", session.id);
    return NextResponse.json({ ok: false, error: "HASH_MISMATCH" }, { status: 400 });
  }

  const code = codeParam || jti;

  const tok = await digigoOauthToken({ credentialId, code });
  if (!tok.ok) {
    const msg = s((tok as any).error || "DIGIGO_TOKEN_FAILED");
    await service.from("invoice_signatures").update({ state: "failed", error_message: msg }).eq("invoice_id", invoiceId);
    await service.from("digigo_sign_sessions").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", session.id);
    return NextResponse.json({ ok: false, error: "DIGIGO_TOKEN_FAILED", message: msg }, { status: 400 });
  }

  const sign = await digigoSignHash({ credentialId, sad: (tok as any).sad, hashes: [unsignedHash] });
  if (!sign.ok) {
    const msg = s((sign as any).error || "DIGIGO_SIGN_FAILED");
    await service.from("invoice_signatures").update({ state: "failed", error_message: msg }).eq("invoice_id", invoiceId);
    await service.from("digigo_sign_sessions").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", session.id);
    return NextResponse.json({ ok: false, error: "DIGIGO_SIGN_FAILED", message: msg }, { status: 400 });
  }

  const signatureValue = s((sign as any).value);
  if (!signatureValue) {
    await service.from("invoice_signatures").update({ state: "failed", error_message: "SIGNATURE_VALUE_MISSING" }).eq("invoice_id", invoiceId);
    await service.from("digigo_sign_sessions").update({ status: "failed", error_message: "SIGNATURE_VALUE_MISSING", updated_at: new Date().toISOString() }).eq("id", session.id);
    return NextResponse.json({ ok: false, error: "SIGNATURE_VALUE_MISSING" }, { status: 400 });
  }

  const signedXml = injectSignatureIntoTeifXml(unsignedXml, signatureValue);
  const signedHash = sha256Base64Utf8(signedXml);

  await service
    .from("invoice_signatures")
    .update({
      state: "signed",
      signed_at: new Date().toISOString(),
      signed_hash: signedHash,
      signed_xml: signedXml,
      error_message: null,
      meta: {
        ...meta,
        state: "signed",
        digigo_state: state,
        digigo: { jti, code, sad: (tok as any).sad, algorithm: s((sign as any).algorithm || "") },
        signed_hash: signedHash,
        unsigned_hash: unsignedHash,
      },
    })
    .eq("invoice_id", invoiceId);

  await service
    .from("digigo_sign_sessions")
    .update({ status: "done", error_message: null, updated_at: new Date().toISOString() })
    .eq("id", session.id);

  const back_url = backUrlBody || s(session.back_url) || backCookie || `/invoices/${invoiceId}`;
  const res = NextResponse.json({ ok: true, back_url, signed_hash: signedHash }, { status: 200 });
  res.cookies.set("digigo_state", "", { path: "/", maxAge: 0 });
  res.cookies.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
  res.cookies.set("digigo_back_url", "", { path: "/", maxAge: 0 });
  return res;
}
