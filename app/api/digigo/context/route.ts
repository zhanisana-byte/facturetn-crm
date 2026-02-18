import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const service = createServiceClient();

  try {
    const { searchParams } = new URL(req.url);
    const state = s(searchParams.get("state"));
    let invoiceId = s(searchParams.get("invoiceId") || searchParams.get("invoice_id"));

    if (!state) {
      return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
    }

    if (!invoiceId) {
      const { data: session, error } = await service
        .from("digigo_sign_sessions")
        .select("invoice_id, company_id, back_url")
        .eq("state", state)
        .maybeSingle();

      if (error) {
        return NextResponse.json(
          { ok: false, error: "SESSION_READ_FAILED", message: error.message },
          { status: 500 }
        );
      }

      invoiceId = s((session as any)?.invoice_id);

      if (!invoiceId) {
        return NextResponse.json(
          { ok: false, error: "SESSION_NOT_FOUND" },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          ok: true,
          state,
          invoiceId,
          companyId: (session as any)?.company_id ?? null,
          backUrl: (session as any)?.back_url ?? null,
        },
        { status: 200 }
      );
    }

    if (!isUuid(invoiceId)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_INVOICE_ID" },
        { status: 400 }
      );
    }

    const { data: sig, error: sigErr } = await service
      .from("invoice_signatures")
      .select("invoice_id, meta")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sigErr) {
      return NextResponse.json(
        { ok: false, error: "SIGNATURE_READ_FAILED", message: sigErr.message },
        { status: 500 }
      );
    }

    if (!sig) {
      return NextResponse.json(
        { ok: false, error: "SIGNATURE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const metaState = s((sig as any)?.meta?.state);

    if (metaState && metaState !== state) {
      return NextResponse.json(
        { ok: false, error: "STATE_MISMATCH" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        state,
        invoiceId,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "CONTEXT_FATAL", message: s(e?.message || e) },
      { status: 500 }
    );
  }
}
