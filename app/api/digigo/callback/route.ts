import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

function s(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const body = await req.json().catch(() => ({} as any));

  const stateFromCookie = s(cookieStore.get("digigo_state")?.value);
  const state = s(body.state) || stateFromCookie;

  if (!state) {
    return NextResponse.json({ error: "MISSING_STATE" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: session } = await service
    .from("digigo_sign_sessions")
    .select("id,invoice_id,back_url,status,expires_at")
    .eq("state", state)
    .maybeSingle();

  if (!session?.id) {
    return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 400 });
  }

  const exp = new Date(s(session.expires_at)).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    await service
      .from("digigo_sign_sessions")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", session.id);

    return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 400 });
  }

  cookieStore.set("digigo_state", "", { path: "/", maxAge: 0 });

  return NextResponse.json({ ok: true, back_url: s(session.back_url) || "/app" });
}
