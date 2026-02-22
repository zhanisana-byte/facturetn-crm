// app/api/digigo/callback/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/digigo/supabaseAdmin";
import { decodeJwtPayload } from "@/lib/digigo/jwt";
import { s } from "@/lib/digigo/ids";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));
  const token = s(body?.token);
  if (!token) return NextResponse.json({ error: "MISSING_TOKEN" }, { status: 400 });

  const payload = decodeJwtPayload(token) || {};
  const jti = s(payload?.jti);
  if (!jti) return NextResponse.json({ error: "MISSING_JTI" }, { status: 400 });

  const ck = cookies();
  const cookieState = s(ck.get("dg_state")?.value);
  const cookieInvoice = s(ck.get("dg_invoice_id")?.value);
  const cookieBack = s(ck.get("dg_back_url")?.value);

  const admin = supabaseAdmin();

  const byJti = await admin
    .from("digigo_sign_sessions")
    .select("id, invoice_id, state, back_url, status, expires_at")
    .eq("digigo_jti", jti)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let row = byJti.data as any;

  if (!row && cookieState) {
    const byState = await admin
      .from("digigo_sign_sessions")
      .select("id, invoice_id, state, back_url, status, expires_at")
      .eq("state", cookieState)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = byState.data as any;

    if (row?.id) {
      await admin
        .from("digigo_sign_sessions")
        .update({ digigo_jti: jti, status: "done", updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  if (!row && cookieInvoice) {
    const byInvoice = await admin
      .from("digigo_sign_sessions")
      .select("id, invoice_id, state, back_url, status, expires_at")
      .eq("invoice_id", cookieInvoice)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = byInvoice.data as any;

    if (row?.id) {
      await admin
        .from("digigo_sign_sessions")
        .update({ digigo_jti: jti, status: "done", updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  if (!row?.invoice_id) return NextResponse.json({ error: "SESSION_NOT_FOUND", jti }, { status: 404 });

  const invoice_id = s(row.invoice_id);
  const back_url = s(row.back_url) || cookieBack || `/invoices/${invoice_id}`;
  const state = s(row.state);

  return NextResponse.json({ ok: true, invoice_id, back_url, state, jti });
}
