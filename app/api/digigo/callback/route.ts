import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

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

function safeBase64UrlJson(part: string) {
  try {
    const payload = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = s(body?.token);
    if (!token) return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });

    const payload = decodeJwtNoVerify(token) || {};
    const jti = s(payload?.jti);
    if (!jti) return NextResponse.json({ error: "MISSING_JTI" }, { status: 400 });

    const parts = token.split(".");
    const header = parts.length >= 1 ? safeBase64UrlJson(parts[0]) || {} : {};
    const alg = s((header as any)?.alg);
    const iss = s((payload as any)?.iss);
    const exp = Number((payload as any)?.exp ?? 0);
    const nowSec = Math.floor(Date.now() / 1000);
    if (exp && exp < nowSec) return NextResponse.json({ error: "TOKEN_EXPIRED" }, { status: 400 });
    if (alg && alg.toLowerCase() === "none") return NextResponse.json({ error: "BAD_TOKEN_ALG" }, { status: 400 });

    const c = await cookies();
    const state = s(body?.state || c.get("digigo_state")?.value || "");
    if (!state) return NextResponse.json({ error: "MISSING_STATE" }, { status: 400 });

    const supabaseUrl = s(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const serviceRole = s(process.env.SUPABASE_SERVICE_ROLE_KEY);
    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json({ error: "MISSING_SUPABASE_SERVICE_ROLE" }, { status: 500 });
    }

    const sb = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const nowIso = new Date().toISOString();

    const { data: sess, error: sessErr } = await sb
      .from("digigo_sign_sessions")
      .select("id, invoice_id, back_url, expires_at")
      .eq("state", state)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessErr) return NextResponse.json({ error: sessErr.message }, { status: 500 });
    if (!sess) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

    const isExpired = sess?.expires_at ? new Date(sess.expires_at).getTime() <= Date.now() : true;
    if (isExpired) {
      await sb
        .from("digigo_sign_sessions")
        .update({ status: "expired", error_message: "AUTO_EXPIRE", updated_at: nowIso })
        .eq("id", sess.id);
      return NextResponse.json(
        { error: "SESSION_EXPIRED", back_url: sess.back_url || `/invoices/${sess.invoice_id}` },
        { status: 400 }
      );
    }

    const extendIso = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: updErr } = await sb
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        digigo_jti: jti,
        error_message: null,
        updated_at: nowIso,
        expires_at: extendIso,
      })
      .eq("id", sess.id);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      back_url: sess.back_url || `/invoices/${sess.invoice_id}`,
      digigo_jti: jti,
      session_id: sess.id,
      state,
      iss,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "UNKNOWN" }, { status: 500 });
  }
}
