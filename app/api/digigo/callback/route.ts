import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

function s(v: any) {
  return String(v ?? "").trim();
}

function decodeJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const json = Buffer.from(b64 + pad, "base64").toString("utf8");
  return JSON.parse(json);
}

export async function POST(req: Request) {
  const admin = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const token = s(body.token);
  if (!token) return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });

  let payload: any;
  try {
    payload = decodeJwtPayload(token);
  } catch {
    payload = null;
  }

  const jti = s(payload?.jti);
  if (!jti) return NextResponse.json({ error: "MISSING_JTI" }, { status: 400 });

  const { data: sess, error: sessErr } = await admin
    .from("digigo_sign_sessions")
    .select("id, invoice_id, back_url")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessErr || !sess) return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });

  const { error: updErr } = await admin
    .from("digigo_sign_sessions")
    .update({
      status: "done",
      digigo_jti: jti,
      updated_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", sess.id);

  if (updErr) return NextResponse.json({ error: "SESSION_UPDATE_FAILED", details: updErr.message }, { status: 500 });

  await admin
    .from("invoice_signatures")
    .update({
      session_id: jti,
      updated_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("invoice_id", sess.invoice_id)
    .eq("provider", "digigo");

  return NextResponse.json({
    ok: true,
    invoice_id: sess.invoice_id,
    back_url: sess.back_url || `/invoices/${sess.invoice_id}`,
  });
}
