import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function uuid() {
  return crypto.randomUUID();
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const invoice_id = s(body?.invoice_id || "");
    const back_url = s(body?.back_url || "");

    if (!invoice_id) {
      return NextResponse.json(
        { ok: false, error: "INVOICE_ID_MISSING" },
        { status: 400 }
      );
    }

    const inv = await service
      .from("invoices")
      .select("id, company_id")
      .eq("id", invoice_id)
      .maybeSingle();

    if (!inv.data?.id) {
      return NextResponse.json(
        { ok: false, error: "INVOICE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const sig = await service
      .from("invoice_signatures")
      .select("unsigned_xml, unsigned_hash")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    const unsigned_xml = s(sig.data?.unsigned_xml);
    let unsigned_hash = s(sig.data?.unsigned_hash);

    if (!unsigned_hash && unsigned_xml) {
      unsigned_hash = sha256Base64Utf8(unsigned_xml);
    }

    if (!unsigned_hash) {
      return NextResponse.json(
        { ok: false, error: "UNSIGNED_HASH_MISSING" },
        { status: 400 }
      );
    }

    const cred = await service
      .from("ttn_credentials")
      .select("signature_config")
      .eq("company_id", inv.data.company_id)
      .eq("environment", "production")
      .maybeSingle();

    const cfg =
      cred.data?.signature_config &&
      typeof cred.data.signature_config === "object"
        ? cred.data.signature_config
        : {};

    const credentialId = s(
      cfg?.digigo_signer_email ||
      cfg?.credentialId ||
      cfg?.email
    );

    if (!credentialId) {
      return NextResponse.json(
        { ok: false, error: "DIGIGO_SIGNER_EMAIL_NOT_CONFIGURED" },
        { status: 400 }
      );
    }

    const state = uuid();

    const authorize_url = digigoAuthorizeUrl({
      state,
      credentialId,
    });

    return NextResponse.json({
      ok: true,
      authorize_url,
      state,
      invoice_id,
      back_url,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "START_FAILED",
        message: String(e?.message || e),
      },
      { status: 500 }
    );
  }
}
