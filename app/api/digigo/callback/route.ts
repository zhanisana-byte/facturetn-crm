import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = s(url.searchParams.get("token") || "");
  const code = s(url.searchParams.get("code") || "");
  const state_qs = s(url.searchParams.get("state") || "");
  const back_qs = s(url.searchParams.get("back_url") || url.searchParams.get("back") || "");

  const cookieStore = await cookies();
  const state_cookie = s(cookieStore.get("digigo_state")?.value || "");
  const invoice_cookie = s(cookieStore.get("digigo_invoice_id")?.value || "");
  const back_cookie = s(cookieStore.get("digigo_back_url")?.value || "");

  const state = state_qs || state_cookie;
  const back_url = back_qs || back_cookie || "/app";

  if (!state || !isUuid(state)) {
    return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: session } = await service
    .from("digigo_sign_sessions")
    .select("id,invoice_id,back_url,status,expires_at")
    .eq("state", state)
    .maybeSingle();

  if (!session?.id) {
    return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });
  }

  const exp = new Date(s(session.expires_at)).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    await service
      .from("digigo_sign_sessions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", session.id);

    return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
  }

  const invoice_id = s(session.invoice_id || "") || invoice_cookie;
  if (!invoice_id || !isUuid(invoice_id)) {
    return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
  }

  const final_back = s(session.back_url || "") || back_url;

  cookieStore.set("digigo_state", "", { path: "/", maxAge: 0 });
  cookieStore.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
  cookieStore.set("digigo_back_url", "", { path: "/", maxAge: 0 });

  return NextResponse.json(
    { ok: true, state, invoice_id, back_url: final_back, token, code },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  return GET(req);
}
