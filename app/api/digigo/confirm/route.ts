// app/api/digigo/confirm/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { extractJwtJti, digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";
import { injectDsSignatureIntoTeif } from "@/lib/ttn/teif-inject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  const service = createServiceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const token = s(body?.token);
    const stateFromBody = s(body?.state);
    const stateFromCookie = s(cookies().get("digigo_state")?.value);
    const state = stateFromBody || stateFromCookie;

    let invoiceId = s(body?.invoiceId ?? body?.invoice_id ?? body?.id);
    const invoiceFromCookie = s(cookies().get("digigo_invoice_id")?.value);
    if (!invoiceId) invoiceId = invoiceFromCookie;

    if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
    if (!state) return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });

    if (!invoiceId) {
      const { data: session, error: sessErr } = await service
        .from("digigo_sign_sessions")
        .select("invoice_id")
        .eq("state", state)
        .maybeSingle();

      if (sessErr) {
        return NextResponse.json({ ok: false, error: "SESSION_READ_FAILED", message: sessErr.message }, { status: 500 });
      }
      invoiceId = s((session as any)?.invoice_id);
    }

    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const sigRes = await service
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sigRes.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_READ_FAILED", message: sigRes.error.message }, { status: 500 });
    }

    const sig: any = sigRes.data;
    if (!sig) return NextResponse.json({ ok: false, error: "SIGNATURE_NOT_FOUND" }, { status: 404 });

    const meta = sig?.meta && typeof sig.meta === "object" ? sig.meta : {};
    const credentialId = s(meta?.credentialId);
    const unsignedXml = s(sig?.unsigned_xml);
    const unsignedHash = s(sig?.unsigned_hash);

    if (!credentialId) return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    if (!unsignedXml) return NextResponse.json({ ok: false, error: "UNSIGNED_XML_MISSING" }, { status: 400 });
    if (!unsignedHash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

    const metaState = s(meta?.state);
    if (metaState && metaState !== state) {
      return NextResponse.json({ ok: false, error: "STATE_MISMATCH" }, { status: 409 });
    }

    const { jti } = extractJwtJti(token);
    const { sad } = await digigoOauthTokenFromJti({ jti });

    const { value } = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
      hashAlgo: "SHA256",
      signAlgo: "RSA",
    });

    const signedXml = injectDsSignatureIntoTeif(unsignedXml, value);
    const nowIso = new Date().toISOString();

    const up = await service
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_at: nowIso,
        signed_xml: signedXml,
        signed_hash: null,
        error_message: null,
        updated_at: nowIso,
        meta: { ...meta, state },
      })
      .eq("invoice_id", invoiceId);

    if (up.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPDATE_FAILED", message: up.error.message }, { status: 500 });
    }

    await service
      .from("invoices")
      .update({
        signature_status: "signed",
        signature_provider: "digigo",
        ttn_signed: true,
        updated_at: nowIso,
      })
      .eq("id", invoiceId);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "CONFIRM_FATAL", message: s(e?.message || e) }, { status: 500 });
  }
}
