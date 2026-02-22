import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function safeJwtDecode(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return {};
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();

    const body = await req.json().catch(() => ({}));
    const token = s(body?.token);

    if (!token) {
      return NextResponse.json({ ok: false, error: "TOKEN_MANQUANT" }, { status: 400 });
    }

    const jar = await cookies();
    const invoiceId = s(jar.get("digigo_invoice_id")?.value);
    const state = s(jar.get("digigo_state")?.value);
    const backUrl = s(jar.get("digigo_back_url")?.value) || "/invoices";

    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json({ ok: false, error: "BAD_INVOICE_ID", back_url: backUrl }, { status: 400 });
    }
    if (!state || !isUuid(state)) {
      return NextResponse.json({ ok: false, error: "MISSING_STATE", back_url: backUrl }, { status: 400 });
    }

    const sessionRes = await service
      .from("digigo_sign_sessions")
      .select("*")
      .eq("invoice_id", invoiceId)
      .eq("state", state)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionRes.error) {
      return NextResponse.json(
        { ok: false, error: "SESSION_READ_FAILED", message: sessionRes.error.message, back_url: backUrl },
        { status: 500 }
      );
    }

    const session = sessionRes.data as any;
    if (!session) {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND", back_url: backUrl }, { status: 404 });
    }

    const now = Date.now();
    const exp = session?.expires_at ? new Date(session.expires_at).getTime() : 0;
    const isExpired = exp > 0 && exp <= now;

    if (isExpired) {
      await service
        .from("digigo_sign_sessions")
        .update({ status: "expired", error_message: session?.error_message || "AUTO_EXPIRE" })
        .eq("id", session.id);

      return NextResponse.json({ ok: false, error: "SESSION_EXPIRED", back_url: backUrl }, { status: 410 });
    }

    const payload = safeJwtDecode(token);
    const jti = s(payload?.jti);

    await service
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        digigo_jti: jti || session?.digigo_jti || null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    return NextResponse.json({ ok: true, back_url: backUrl }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", message: e?.message || "fetch failed" }, { status: 500 });
  }
}
