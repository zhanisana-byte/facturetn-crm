import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function b64urlToUtf8(input: string) {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf8");
}

function parseJwt(token: string): any {
  const parts = s(token).split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(b64urlToUtf8(parts[1]));
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = s(body?.token);
  const invoice_id = s(body?.invoice_id ?? body?.invoiceId);

  if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
  if (!invoice_id || !isUuid(invoice_id)) {
    return NextResponse.json({ ok: false, error: "BAD_INVOICE_ID" }, { status: 400 });
  }

  const payload = parseJwt(token);
  const jti = s(payload?.jti);
  if (!jti) return NextResponse.json({ ok: false, error: "MISSING_JTI" }, { status: 400 });

  const service = createServiceClient();
  const nowIso = new Date().toISOString();

  const sessRes = await service
    .from("digigo_sign_sessions")
    .select("id, invoice_id, back_url, status, expires_at")
    .eq("invoice_id", invoice_id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessRes.error) {
    return NextResponse.json(
      { ok: false, error: "SESSION_READ_FAILED", message: sessRes.error.message },
      { status: 500 }
    );
  }

  const session: any = sessRes.data;
  if (!session) {
    return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });
  }

  const expMs = session?.expires_at ? new Date(session.expires_at).getTime() : 0;
  if (!expMs || expMs <= Date.now()) {
    await service
      .from("digigo_sign_sessions")
      .update({ status: "expired", error_message: "AUTO_EXPIRE", updated_at: nowIso })
      .eq("id", session.id);

    return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
  }

  const updRes = await service
    .from("digigo_sign_sessions")
    .update({ status: "done", digigo_jti: jti, error_message: null, updated_at: nowIso })
    .eq("id", session.id);

  if (updRes.error) {
    return NextResponse.json(
      { ok: false, error: "SESSION_UPDATE_FAILED", message: updRes.error.message },
      { status: 500 }
    );
  }

  const back_url = s(session?.back_url) || `/invoices/${invoice_id}`;

  return NextResponse.json(
    {
      ok: true,
      invoice_id,
      back_url,
      digigo_jti: jti,
    },
    { status: 200 }
  );
}
