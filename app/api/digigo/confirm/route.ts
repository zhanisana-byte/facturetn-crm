import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { jwtGetJti } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = s(body?.token);

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "TOKEN_MISSING" },
        { status: 400 }
      );
    }

    const jti = jwtGetJti(token);

    if (!jti) {
      return NextResponse.json(
        { ok: false, error: "JWT_JTI_MISSING" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const stateFromCookie = s(cookieStore.get("digigo_state")?.value);
    const stateFromBody = s(body?.state);
    const state = stateFromBody || stateFromCookie;

    if (!state) {
      return NextResponse.json(
        { ok: false, error: "SESSION_NOT_FOUND" },
        { status: 400 }
      );
    }

    const service = createServiceClient();

    const { data: session, error } = await service
      .from("digigo_sign_sessions")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    if (error || !session?.id) {
      return NextResponse.json(
        { ok: false, error: "SESSION_NOT_FOUND" },
        { status: 400 }
      );
    }

    const expiresAt = new Date(session.expires_at).getTime();

    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      await service
        .from("digigo_sign_sessions")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      return NextResponse.json(
        { ok: false, error: "SESSION_EXPIRED" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        session_id: session.id,
        invoice_id: session.invoice_id,
        jti,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
