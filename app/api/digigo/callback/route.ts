import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createClient } from "@supabase/supabase-js";

function s(v: any) {
  return String(v ?? "").trim();
}

function decodeJwtNoVerify(token: string) {
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
    if (!token) return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });

    const authSb = createRouteHandlerClient({ cookies });
    const { data: authData, error: authErr } = await authSb.auth.getUser();
    if (authErr) return NextResponse.json({ error: "AUTH_FAILED" }, { status: 401 });
    const userId = s(authData?.user?.id);
    if (!userId) return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });

    const payload = decodeJwtNoVerify(token) || {};
    const jti = s(payload?.jti);
    if (!jti) return NextResponse.json({ error: "MISSING_JTI" }, { status: 400 });

    const supabaseUrl = s(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const serviceRole = s(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json({ error: "MISSING_SUPABASE_SERVICE_ROLE" }, { status: 500 });
    }

    const adminSb = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowIso = new Date().toISOString();

    const { data: sess, error: sessErr } = await adminSb
      .from("digigo_sign_sessions")
      .select("id, invoice_id, back_url, status, expires_at")
      .eq("created_by", userId)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });
    if (!sess) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

    const { error: updErr } = await adminSb
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        digigo_jti: jti,
        error_message: null,
        updated_at: nowIso,
      })
      .eq("id", sess.id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      back_url: sess.back_url || `/invoices/${sess.invoice_id}`,
      digigo_jti: jti,
      session_id: sess.id,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "UNKNOWN" }, { status: 500 });
  }
}
