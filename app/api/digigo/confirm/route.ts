import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoOauthToken, digigoSignHash } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();

    const body = await req.json().catch(() => ({}));
    const invoiceId = s(body?.invoiceId ?? body?.invoice_id ?? body?.id);
    const code = s(body?.code);
    const state = s(body?.state);

    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }
    if (!code) return NextResponse.json({ ok: false, error: "MISSING_CODE" }, { status: 400 });
    if (!state) return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });

    const { data: session } = await service
      .from("digigo_sign_sessions")
      .select("id,invoice_id,back_url,status")
      .eq("state", state)
      .maybeSingle();

    const sigRes = await service
      .from("invoice_signatures")
      .select("meta,unsigned_xml,unsigned_hash")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sigRes.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_READ_FAILED", message: sigRes.error.message }, { status: 500 });
    }

    const sig = sigRes.data as any;
    if (!sig) return NextResponse.json({ ok: false, error: "SIGNATURE_NOT_FOUND" }, { status: 404 });

    const meta = sig?.meta && typeof sig.meta === "object" ? sig.meta : {};
    const credentialId = s(meta?.credentialId || meta?.credential_id || meta?.digigo_signer_email || "");
    const unsignedXml = s(sig?.unsigned_xml);
    const unsignedHash = s(sig?.unsigned_hash);

    if (!credentialId) return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    if (!unsignedXml) return NextResponse.json({ ok: false, error: "UNSIGNED_XML_MISSING" }, { status: 400 });
    if (!unsignedHash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

    const tok = await digigoOauthToken({ credentialId, code });
    if (!tok.ok) {
      await service.from("invoice_signatures").update({ state: "failed", error_message: s((tok as any).error || "TOKEN_FAILED") }).eq("invoice_id", invoiceId);
      await service.from("invoices").update({ signature_status: "failed" }).eq("id", invoiceId);
      if (session?.id) await service.from("digigo_sign_sessions").update({ status: "failed", error_message: s((tok as any).error || "TOKEN_FAILED") }).eq("id", session.id);
      return NextResponse.json({ ok: false, error: "DIGIGO_TOKEN_FAILED", message: s((tok as any).error || "TOKEN_FAILED") }, { status: 400 });
    }

    const sign = await digigoSignHash({ credentialId, sad: (tok as any).sad, hashes: [unsignedHash] });
    if (!sign.ok) {
      await service.from("invoice_signatures").update({ state: "failed", error_message: s((sign as any).error || "SIGN_FAILED") }).eq("invoice_id", invoiceId);
      await service.from("invoices").update({ signature_status: "failed" }).eq("id", invoiceId);
      if (session?.id) await service.from("digigo_sign_sessions").update({ status: "failed", error_message: s((sign as any).error || "SIGN_FAILED") }).eq("id", session.id);
      return NextResponse.json({ ok: false, error: "DIGIGO_SIGN_FAILED", message: s((sign as any).error || "SIGN_FAILED") }, { status: 400 });
    }

    const signatureValue = s((sign as any).value);
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
          digigo: { code, sad: (tok as any).sad, algorithm: s((sign as any).algorithm || "") },
          signed_hash: signedHash,
          unsigned_hash: unsignedHash,
        },
      })
      .eq("invoice_id", invoiceId);

    await service
      .from("invoices")
      .update({
        signature_status: "signed",
        signature_provider: "digigo",
        ttn_signed: true,
      })
      .eq("id", invoiceId);

    if (session?.id) {
      await service.from("digigo_sign_sessions").update({ status: "done", error_message: null, updated_at: new Date().toISOString() }).eq("id", session.id);
    }

    return NextResponse.json({ ok: true, signed_hash: signedHash }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: e?.message || "Unknown error" }, { status: 500 });
  }
}
