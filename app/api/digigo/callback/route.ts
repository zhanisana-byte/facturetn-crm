import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoOauthToken, digigoSignHash, jwtGetJti } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

async function safeUpdateInvoiceSigned(svc: any, invoiceId: string) {
  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  payload.signature_status = "signed";
  payload.signature_provider = "digigo";
  payload.ttn_signed = true;

  const r = await svc.from("invoices").update(payload).eq("id", invoiceId);
  if (!r.error) return;

  const msg = s(r.error.message);
  if (msg.includes("column") && msg.includes("does not exist")) {
    await svc
      .from("invoices")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", invoiceId);
    return;
  }

  throw r.error;
}

export async function POST(req: Request) {
  const svc = createServiceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const state = s(body.state);
    const token = s(body.token);
    const codeFromBody = s(body.code);

    if (!state) return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });

    const { data: session, error: sessErr } = await svc
      .from("digigo_sign_sessions")
      .select("id,invoice_id,back_url,expires_at,status")
      .eq("state", state)
      .maybeSingle();

    if (sessErr) return NextResponse.json({ ok: false, error: sessErr.message }, { status: 500 });
    if (!session) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });

    const invoiceId = s((session as any).invoice_id);
    if (!invoiceId) return NextResponse.json({ ok: false, error: "SESSION_NO_INVOICE" }, { status: 400 });

    const expRaw = s((session as any).expires_at);
    if (expRaw) {
      const exp = Date.parse(expRaw);
      if (Number.isFinite(exp) && exp < Date.now()) {
        await svc.from("digigo_sign_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", (session as any).id);
        await svc.from("invoice_signatures").update({ state: "expired", error_message: "SESSION_EXPIRED", updated_at: new Date().toISOString() }).eq("invoice_id", invoiceId);
        return NextResponse.json({ ok: true, redirect: (session as any).back_url || `/invoices/${invoiceId}` });
      }
    }

    const { data: sig, error: sigErr } = await svc
      .from("invoice_signatures")
      .select("meta,unsigned_xml,unsigned_hash,state")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sigErr) return NextResponse.json({ ok: false, error: sigErr.message }, { status: 500 });
    if (!sig) return NextResponse.json({ ok: false, error: "SIGNATURE_ROW_NOT_FOUND" }, { status: 404 });

    const meta = (sig as any)?.meta && typeof (sig as any).meta === "object" ? (sig as any).meta : {};
    const credentialId = s(meta?.credentialId ?? meta?.credential_id ?? "");
    const unsignedXml = s((sig as any).unsigned_xml);
    const unsignedHash = s((sig as any).unsigned_hash);

    if (!credentialId) return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    if (!unsignedXml) return NextResponse.json({ ok: false, error: "UNSIGNED_XML_MISSING" }, { status: 400 });
    if (!unsignedHash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

    const jti = token ? jwtGetJti(token) : "";
    const code = codeFromBody || jti;

    if (!code) {
      await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: "MISSING_CODE", updated_at: new Date().toISOString() }).eq("id", (session as any).id);
      await svc.from("invoice_signatures").update({ state: "failed", error_message: "MISSING_CODE", updated_at: new Date().toISOString() }).eq("invoice_id", invoiceId);
      return NextResponse.json({ ok: true, redirect: ((session as any).back_url || `/invoices/${invoiceId}`) + `?sig=failed` });
    }

    await svc.from("digigo_sign_sessions").update({ digigo_jti: code, updated_at: new Date().toISOString() }).eq("id", (session as any).id);

    const tok = await digigoOauthToken({ credentialId, code });
    if (!tok.ok) {
      const msg = s((tok as any).error || "TOKEN_FAILED");
      await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", (session as any).id);
      await svc.from("invoice_signatures").update({ state: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("invoice_id", invoiceId);
      return NextResponse.json({ ok: true, redirect: ((session as any).back_url || `/invoices/${invoiceId}`) + `?sig=failed` });
    }

    const sign = await digigoSignHash({ credentialId, sad: (tok as any).sad, hashes: [unsignedHash] });
    if (!sign.ok) {
      const msg = s((sign as any).error || "SIGN_FAILED");
      await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("id", (session as any).id);
      await svc.from("invoice_signatures").update({ state: "failed", error_message: msg, updated_at: new Date().toISOString() }).eq("invoice_id", invoiceId);
      return NextResponse.json({ ok: true, redirect: ((session as any).back_url || `/invoices/${invoiceId}`) + `?sig=failed` });
    }

    const signatureValue = s((sign as any).value);
    const algorithm = s((sign as any).algorithm || "");

    const signedXml = injectSignatureIntoTeifXml(unsignedXml, signatureValue);
    const signedHash = sha256Base64Utf8(signedXml);

    await svc
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_at: new Date().toISOString(),
        signed_hash: signedHash,
        signed_xml: signedXml,
        error_message: null,
        updated_at: new Date().toISOString(),
        meta: {
          ...meta,
          digigo: { code, sad: (tok as any).sad, algorithm },
          unsigned_hash: unsignedHash,
          signed_hash: signedHash,
        },
      })
      .eq("invoice_id", invoiceId);

    await svc
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", (session as any).id);

    await safeUpdateInvoiceSigned(svc, invoiceId);

    return NextResponse.json({ ok: true, redirect: (session as any).back_url || `/invoices/${invoiceId}` });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "CALLBACK_FATAL", details: s(e?.message || e) }, { status: 500 });
  }
}
