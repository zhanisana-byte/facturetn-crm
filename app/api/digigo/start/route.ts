import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo/server";

function s(v: any) {
  return String(v ?? "").trim();
}

function uuid() {
  return crypto.randomUUID();
}

export async function POST(req: Request) {
  const cookieStore = await cookies();

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body?.invoice_id);
  const back_url = s(body?.back_url || "");
  const environment = s(body?.environment || "");

  if (!invoice_id) {
    return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const supabase = await createClient();

  const sig = await supabase
    .from("invoice_signatures")
    .select("unsigned_xml, unsigned_hash")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  const unsigned_xml = s(sig.data?.unsigned_xml || "");
  let unsigned_hash = s(sig.data?.unsigned_hash || "");

  if (!unsigned_hash && unsigned_xml) {
    unsigned_hash = sha256Base64Utf8(unsigned_xml);
  }

  if (!unsigned_hash) {
    return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });
  }

  const state = uuid();

  cookieStore.set("digigo_state", state, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
  cookieStore.set("digigo_invoice_id", invoice_id, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
  if (back_url) cookieStore.set("digigo_back_url", back_url, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
  if (environment) cookieStore.set("digigo_environment", environment, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });

  const authorize_url = digigoAuthorizeUrl({ state, hash: unsigned_hash });

  return NextResponse.json({ ok: true, authorize_url, state, invoice_id, redirect: "/digigo/redirect" });
}
