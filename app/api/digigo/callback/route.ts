import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function s(v: any) {
  return String(v ?? "").trim();
}

function decodeJwt(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = Buffer.from(payload, "base64").toString("utf8");
  return JSON.parse(json);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = s(body?.token);
    if (!token) {
      return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });
    }

    const payload = decodeJwt(token);
    if (!payload) {
      return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
    }

    const jti = s(payload?.jti);
    if (!jti) {
      return NextResponse.json({ error: "MISSING_JTI" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const nowIso = new Date().toISOString();

    const { data: session, error } = await supabase
      .from("digigo_sign_sessions")
      .select("*")
      .eq("digigo_jti", jti)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!session) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await supabase
        .from("digigo_sign_sessions")
        .update({ status: "expired", updated_at: nowIso })
        .eq("id", session.id);

      return NextResponse.json({ error: "SESSION_EXPIRED" }, { status: 400 });
    }

    await supabase
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        updated_at: nowIso,
      })
      .eq("id", session.id);

    return NextResponse.json({
      ok: true,
      state: session.state,
      invoice_id: session.invoice_id,
      back_url: session.back_url,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "UNKNOWN" }, { status: 500 });
  }
}
