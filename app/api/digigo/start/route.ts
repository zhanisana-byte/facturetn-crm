import { NextResponse } from "next/server";
import { digigoAuthorizeUrl } from "@/lib/digigo/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

function s(v: any) {
  return String(v ?? "").trim();
}

function uuid() {
  return crypto.randomUUID();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id);
    if (!invoice_id) {
      return NextResponse.json({ ok: false, error: "BAD_REQUEST" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const sig = await supabase
      .from("invoice_signatures")
      .select("unsigned_xml, unsigned_hash")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    const unsigned_xml = s(sig.data?.unsigned_xml || "");
    let unsigned_hash = s(sig.data?.unsigned_hash || "");

    if (!unsigned_hash && unsigned_xml) {
      unsigned_hash = crypto
        .createHash("sha256")
        .update(Buffer.from(unsigned_xml, "utf8"))
        .digest("base64");
    }

    if (!unsigned_hash) {
      return NextResponse.json(
        { ok: false, error: "UNSIGNED_HASH_MISSING" },
        { status: 400 }
      );
    }

    const state = uuid();

    const authorize_url = digigoAuthorizeUrl({
      state,
      hash: unsigned_hash,
    });

    return NextResponse.json({
      ok: true,
      authorize_url,
      state,
      invoice_id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "START_FAILED", message: e?.message || "" },
      { status: 500 }
    );
  }
}
