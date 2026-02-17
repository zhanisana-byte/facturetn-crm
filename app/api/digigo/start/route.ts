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

function json(data: any, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      pragma: "no-cache",
      expires: "0",
    },
  });
}

export async function GET() {
  return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const invoice_id = s(body?.invoice_id || "");
    const back_url = s(body?.back_url || "");

    if (!invoice_id) return json({ ok: false, error: "INVOICE_ID_MISSING" }, 400);

    const inv = await service
      .from("invoices")
      .select("id, company_id")
      .eq("id", invoice_id)
      .maybeSingle();

    if (!inv.data?.id) return json({ ok: false, error: "INVOICE_NOT_FOUND" }, 404);

    const sig = await service
      .from("invoice_signatures")
      .select("unsigned_xml, unsigned_hash")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    const unsigned_xml = s(sig.data?.unsigned_xml);
    let unsigned_hash = s(sig.data?.unsigned_hash);

    if (!unsigned_hash && unsigned_xml) unsigned_hash = sha256Base64Utf8(unsigned_xml);
    if (!unsigned_hash) return json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, 400);

    const cred = await service
      .from("ttn_credentials")
      .select("signature_config")
      .eq("company_id", inv.data.company_id)
      .eq("environment", "production")
      .maybeSingle();

    const cfg =
      cred.data?.signature_config && typeof cred.data.signature_config === "object"
        ? cred.data.signature_config
        : {};

    const credentialId = s(cfg?.digigo_signer_email || cfg?.credentialId || cfg?.email);

    if (!credentialId) {
      return json({ ok: false, error: "DIGIGO_SIGNER_EMAIL_NOT_CONFIGURED" }, 400);
    }

    const state = uuid();

    const authorize_url = digigoAuthorizeUrl({
      state,
      credentialId,
      hash: unsigned_hash,
      numSignatures: 1,
    });

    return json({
      ok: true,
      authorize_url,
      state,
      invoice_id,
      back_url,
    });
  } catch (e: any) {
    return json(
      { ok: false, error: "START_FAILED", message: String(e?.message || e) },
      500
    );
  }
}
