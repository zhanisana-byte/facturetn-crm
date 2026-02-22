import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

function env(name: string, fallback = "") {
  return s(process.env[name] ?? fallback);
}

function supabaseAdmin() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = s(url.searchParams.get("token"));
  const stateFromUrl = s(url.searchParams.get("state"));

  const ck = await cookies();
  const cookieState = s(ck.get("dg_state")?.value);
  const cookieInvoice = s(ck.get("dg_invoice_id")?.value);
  const cookieBack = s(ck.get("dg_back_url")?.value);

  const state = stateFromUrl || cookieState;

  if (!token) {
    return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
  }
  if (!state) {
    return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
  }

  const payload = parseJwt(token);
  const jti = s(payload?.jti);
  if (!jti) {
    return NextResponse.json({ ok: false, error: "MISSING_JTI" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: sessionRow } = await sb
    .from("digigo_sign_sessions")
    .select("id, invoice_id, state, status, expires_at, digigo_jti")
    .eq("state", state)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const invoiceId = s(sessionRow?.invoice_id) || cookieInvoice;
  const backUrl = cookieBack || (invoiceId ? `/invoices/${invoiceId}` : "/invoices");

  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: "BAD_INVOICE_ID", state, jti }, { status: 400 });
  }

  await sb
    .from("digigo_sign_sessions")
    .update({ digigo_jti: jti, status: "done", updated_at: new Date().toISOString() })
    .eq("state", state)
    .is("digigo_jti", null);

  await sb
    .from("invoice_signatures")
    .update({
      state: "pending",
      provider: "digigo",
      updated_at: new Date().toISOString(),
      meta: {
        state,
        back_url: backUrl,
        credentialId: s(payload?.sub),
        jti,
      },
    })
    .eq("invoice_id", invoiceId)
    .eq("provider", "digigo");

  return NextResponse.redirect(new URL(`/digigo/redirect?token=${encodeURIComponent(token)}`, url.origin));
}
