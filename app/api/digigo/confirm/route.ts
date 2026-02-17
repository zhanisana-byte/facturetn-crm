// app/api/digigo/confirm/route.ts
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoCall } from "@/lib/signature/digigoClient";

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
    const token = s(body?.token);
    let code = s(body?.code);
    const state = s(body?.state);

    if (!code && token) {
      const parts = token.split(".");
      if (parts.length === 3) {
        try {
          const payloadJson = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
          const payload = JSON.parse(payloadJson);
          code = s(payload?.jti);
        } catch {}
      }
    }

    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }
    if (!code) return NextResponse.json({ ok: false, error: "MISSING_CODE" }, { status: 400 });
    if (!state) return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });

    const sigRes = await service
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sigRes.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_READ_FAILED", message: sigRes.error.message }, { status: 500 });
    }
    const sig = sigRes.data;
    if (!sig) return NextResponse.json({ ok: false, error: "SIGNATURE_NOT_FOUND" }, { status: 404 });

    const meta = (sig as any)?.meta && typeof (sig as any).meta === "object" ? (sig as any).meta : {};
    const credentialId = s(meta?.credentialId);
    const unsigned_hash = s((sig as any)?.unsigned_hash);

    if (!credentialId) return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    if (!unsigned_hash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

    const confirmPayload = {
      credentialId,
      state,
      code,
      hash: unsigned_hash,
    };

    const resp = await digigoCall("confirm", confirmPayload);

    if (!resp.ok) {
      await service
        .from("invoice_signatures")
        .update({ state: "failed", error_message: s(resp.error || "CONFIRM_FAILED") })
        .eq("invoice_id", invoiceId);

      return NextResponse.json(
        { ok: false, error: "DIGIGO_CONFIRM_FAILED", message: s(resp.error || "Confirm failed"), status: resp.status || 400 },
        { status: 400 }
      );
    }

    const signedHash = s(resp?.data?.signedHash ?? resp?.data?.signed_hash ?? resp?.data?.hash ?? "");
    const signedXml = s(resp?.data?.signedXml ?? resp?.data?.signed_xml ?? resp?.data?.xml ?? "");

    await service
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_at: new Date().toISOString(),
        signed_hash: signedHash || null,
        signed_xml: signedXml || null,
        error_message: null,
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

    return NextResponse.json({ ok: true, signed_hash: signedHash }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: e?.message || "Unknown error" }, { status: 500 });
  }
}
