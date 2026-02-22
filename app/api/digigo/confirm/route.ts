import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoCall } from "@/lib/signature/digigoClient";
import { digigoOauthTokenFromJti, digigoSignHash, extractJwtJti } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";

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
    const state = s(body?.state);

    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }
    if (!state) return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });

    const sessRes = await service
      .from("digigo_sign_sessions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("state", state)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessRes.error) {
      return NextResponse.json({ ok: false, error: "SESSION_READ_FAILED", message: sessRes.error.message }, { status: 500 });
    }
    const sess = sessRes.data;
    if (!sess) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });

    const tokenJwt = s((sess as any)?.meta?.token ?? (sess as any)?.meta?.tokenJwt ?? "");
    const digigoJti = s((sess as any)?.digigo_jti);

    if (!tokenJwt && !digigoJti) {
      return NextResponse.json({ ok: false, error: "MISSING_TOKEN_OR_JTI" }, { status: 400 });
    }

    const sigRes = await service
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("provider", "digigo")
      .maybeSingle();

    if (sigRes.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_READ_FAILED", message: sigRes.error.message }, { status: 500 });
    }
    const sig = sigRes.data;
    if (!sig) return NextResponse.json({ ok: false, error: "SIGNATURE_NOT_FOUND" }, { status: 404 });

    const meta = (sig as any)?.meta && typeof (sig as any).meta === "object" ? (sig as any).meta : {};
    const credentialId = s(meta?.credentialId ?? meta?.credential_id ?? "");
    const unsignedHash = s((sig as any)?.unsigned_hash);
    const unsignedXml = s((sig as any)?.unsigned_xml);

    if (!credentialId) return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    if (!unsignedHash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });
    if (!unsignedXml) return NextResponse.json({ ok: false, error: "UNSIGNED_XML_MISSING" }, { status: 400 });

    const jti = digigoJti || extractJwtJti(tokenJwt).jti;

    const { sad } = await digigoOauthTokenFromJti({ jti });

    const signed = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
      hashAlgo: "SHA256",
      signAlgo: "RSA",
    });

    const signatureValue = s((signed as any)?.value);
    if (!signatureValue) {
      await service
        .from("invoice_signatures")
        .update({ state: "failed", error_message: "SIGNATURE_EMPTY", updated_at: new Date().toISOString() })
        .eq("invoice_id", invoiceId);

      return NextResponse.json({ ok: false, error: "SIGNATURE_EMPTY" }, { status: 400 });
    }

    const signedXml = injectSignatureIntoTeifXml(unsignedXml, signatureValue);
    const now = new Date().toISOString();

    const up1 = await service
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_at: now,
        signed_hash: signatureValue,
        signed_xml: signedXml,
        error_message: null,
        meta: { ...meta, jti, sad },
        updated_at: now,
      })
      .eq("invoice_id", invoiceId);

    if (up1.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPDATE_FAILED", message: up1.error.message }, { status: 500 });
    }

    const up2 = await service
      .from("digigo_sign_sessions")
      .update({ status: "done", digigo_jti: jti, updated_at: now })
      .eq("invoice_id", invoiceId)
      .eq("state", state);

    if (up2.error) {
      return NextResponse.json({ ok: false, error: "SESSION_UPDATE_FAILED", message: up2.error.message }, { status: 500 });
    }

    const up3 = await service
      .from("invoices")
      .update({
        signature_status: "signed",
        signature_provider: "digigo",
        signed_at: now,
        updated_at: now,
      })
      .eq("id", invoiceId);

    if (up3.error) {
      return NextResponse.json({ ok: false, error: "INVOICE_UPDATE_FAILED", message: up3.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, signed_hash: signatureValue }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: e?.message || "Unknown error" }, { status: 500 });
  }
}
