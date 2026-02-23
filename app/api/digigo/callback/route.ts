import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/digigo/supabaseAdmin";

function s(v: any) {
  return String(v ?? "").trim();
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

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const token = s(body?.token);

  if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });

  const payload = parseJwt(token);
  const jti = s(payload?.jti);

  if (!jti) return NextResponse.json({ ok: false, error: "MISSING_JTI" }, { status: 400 });

  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const sess = await admin
    .from("digigo_sign_sessions")
    .select("id, invoice_id, back_url, status, expires_at, digigo_jti")
    .eq("status", "pending")
    .is("digigo_jti", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sess.data) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });

  const sessionId = s((sess.data as any)?.id);
  const invoice_id = s((sess.data as any)?.invoice_id);
  const back_url = s((sess.data as any)?.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/invoices");

  await admin
    .from("digigo_sign_sessions")
    .update({ digigo_jti: jti, status: "done", updated_at: nowIso })
    .eq("id", sessionId);

  if (invoice_id) {
    await admin
      .from("invoice_signatures")
      .update({
        provider: "digigo",
        state: "pending",
        updated_at: nowIso,
        meta: { jti, sub: s(payload?.sub || ""), azp: s(payload?.azp || "") },
      })
      .eq("invoice_id", invoice_id)
      .eq("provider", "digigo");
  }

  return NextResponse.json({ ok: true, invoice_id, back_url, jti });
}
