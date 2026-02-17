import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const service = createServiceClient();

  const body = await req.json().catch(() => ({}));
  const token = s(body?.token);
  const code = s(body?.code);
  const state = s(body?.state);

  if (!state) return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
  if (!token && !code) return NextResponse.json({ ok: false, error: "MISSING_CODE_OR_TOKEN" }, { status: 400 });

  const sess = await service
    .from("digigo_sign_sessions")
    .select("id, invoice_id, back_url, status, expires_at")
    .eq("state", state)
    .maybeSingle();

  if (sess.error) {
    return NextResponse.json({ ok: false, error: "SESSION_READ_FAILED", message: sess.error.message }, { status: 500 });
  }
  if (!sess.data) {
    return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  const invoice_id = s((sess.data as any).invoice_id);
  const back_url = s((sess.data as any).back_url) || `/invoices/${invoice_id}`;

  await service
    .from("digigo_sign_sessions")
    .update({
      status: "callback_received",
      updated_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", (sess.data as any).id);

  return NextResponse.json({ ok: true, invoice_id, back_url }, { status: 200 });
}
