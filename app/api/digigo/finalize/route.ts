import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  extractJwtJti,
  digigoOauthTokenFromJti,
  digigoSignHash,
} from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const invoiceId = s(body?.invoiceId ?? body?.invoice_id ?? body?.id);
    const state = s(body?.state);
    const token = s(body?.token);

    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_INVOICE_ID" },
        { status: 400 }
      );
    }

    if (!state) {
      return NextResponse.json(
        { ok: false, error: "MISSING_STATE" },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "MISSING_TOKEN" },
        { status: 400 }
      );
    }

    const sessionRes = await service
      .from("digigo_sign_sessions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("state", state)
      .maybeSingle();

    if (sessionRes.error) {
      return NextResponse.json(
        {
          ok: false,
          error: "SESSION_READ_FAILED",
          message: sessionRes.error.message,
        },
        { status: 500 }
      );
    }

    const session = sessionRes.data;
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (session.status === "done") {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (session.status === "expired") {
      return NextResponse.json(
        { ok: false, error: "SESSION_EXPIRED" },
        { status: 400 }
      );
    }

    const sigRes = await service
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sigRes.error) {
      return NextResponse.json(
        {
          ok: false,
          error: "SIGNATURE_READ_FAILED",
          message: sigRes.error.message,
        },
        { status: 500 }
      );
    }

    const sig = sigRes.data;
    if (!sig) {
      return NextResponse.json(
        { ok: false, error: "SIGNATURE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const unsignedHash = s(sig.unsigned_hash);
    if (!unsignedHash) {
      return NextResponse.json(
        { ok: false, error: "UNSIGNED_HASH_MISSING" },
        { status: 400 }
      );
    }

    const meta =
      sig.meta && typeof sig.meta === "object" ? sig.meta : {};
    const credentialId = s(meta?.credentialId);

    if (!credentialId) {
      return NextResponse.json(
        { ok: false, error: "CREDENTIAL_ID_MISSING" },
        { status: 400 }
      );
    }

    const { jti } = extractJwtJti(token);

    const { sad } = await digigoOauthTokenFromJti({ jti });

    const { value: signatureValue } = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
    });

    await service
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_at: new Date().toISOString(),
        signed_hash: signatureValue,
        error_message: null,
      })
      .eq("invoice_id", invoiceId);

    await service
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        digigo_jti: jti,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    await service
      .from("invoices")
      .update({
        signature_status: "signed",
        signature_provider: "digigo",
        ttn_signed: true,
        signed_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: s(e?.message || "fetch failed"),
      },
      { status: 500 }
    );
  }
}
