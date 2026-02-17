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

    const meta =
