import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { jwtGetJti, digigoOauthToken } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = s(body?.token);
  if (!token) return NextResponse.json({ error: "TOKEN_MISSING" }, { status: 400 });

  const cookieStore = await cookies();
  const state = s(cookieStore.get("digigo_state")?.value);
  if (!state) return NextResponse.json({ error: "INVALID_STATE" }, { status: 400 });

  const service = createServiceClient();

  const { data: session } = await service
    .from("digigo_sign_sessions")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (!session?.id) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 400 });

  const credentialId = s((session as any).credential_id);
  if (!credentialId) {
    return NextResponse.json({ error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
  }

  const jti = jwtGetJti(token);
  if (!jti) return NextResponse.json({ error: "JWT_JTI_MISSING" }, { status: 400 });

  const oauth = await digigoOauthToken({
    credentialId,
    code: jti,
  });

  if (!oauth.ok) {
    await service
      .from("digigo_sign_sessions")
      .update({ status: "failed", error_message: oauth.error || "OAUTH_FAILED", updated_at: new Date().toISOString() })
      .eq("id", session.id);
    return NextResponse.json({ error: "OAUTH_FAILED", detail: oauth.error }, { status: 400 });
  }

  await service
    .from("digigo_sign_sessions")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", session.id);

  cookieStore.delete("digigo_state");

  return NextResponse.json({ ok: true, sad: oauth.sad }, { status: 200 });
}
