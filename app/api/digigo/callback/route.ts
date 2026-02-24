import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function s(v: any) {
  return String(v ?? "").trim();
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function decodeJti(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return "";
  try {
    const payload = Buffer.from(parts[1], "base64").toString("utf8");
    const json = JSON.parse(payload);
    return s(json?.jti);
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = s(url.searchParams.get("token"));
  const state = s(url.searchParams.get("state"));
  const invoice_id = s(url.searchParams.get("invoice_id"));

  if (!token) {
    const red = new URL("/digigo/redirect?error=MISSING_TOKEN", url.origin);
    if (invoice_id) red.searchParams.set("invoice_id", invoice_id);
    if (state) red.searchParams.set("state", state);
    return NextResponse.redirect(red);
  }

  const red = new URL(`/digigo/redirect?token=${encodeURIComponent(token)}`, url.origin);
  if (invoice_id) red.searchParams.set("invoice_id", invoice_id);
  if (state) red.searchParams.set("state", state);
  return NextResponse.redirect(red);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = s(body?.token);
    const invoice_id = s(body?.invoice_id);

    if (!token || !invoice_id) {
      return NextResponse.json({ ok: false, error: "MISSING_DATA" }, { status: 400 });
    }

    const jti = decodeJti(token);
    if (!jti) {
      return NextResponse.json({ ok: false, error: "INVALID_TOKEN" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase.rpc("digigo_finalize_latest_session", {
      p_invoice_id: invoice_id,
      p_environment: "production",
      p_jti: jti,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || "CALLBACK_ERROR") },
      { status: 500 }
    );
  }
}
