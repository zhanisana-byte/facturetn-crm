import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoOauthToken, digigoSignHash } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

function injectSignature(unsignedXml: string, signatureValue: string) {
  const closingTag = "</Invoice>";
  const signatureBlock = `
  <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
    <ds:SignatureValue>${signatureValue}</ds:SignatureValue>
  </ds:Signature>
`;

  if (!unsignedXml.includes(closingTag)) {
    throw new Error("INVALID_XML_STRUCTURE");
  }

  return unsignedXml.replace(closingTag, signatureBlock + closingTag);
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const code = s(body?.code || body?.token || "");
    const invoice_id = s(body?.invoice_id || "");

    if (!code) {
      return NextResponse.json({ ok: false, error: "CODE_MISSING" }, { status: 400 });
    }

    if (!invoice_id) {
      return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
    }

    const sig = await service
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    if (!sig.data) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_CONTEXT_NOT_FOUND" }, { status: 404 });
    }

    const unsigned_xml = s(sig.data.unsigned_xml);
    const unsigned_hash = s(sig.data.unsigned_hash);
    const credentialId = s(sig.data.meta?.credentialId || "");

    if (!unsigned_xml || !unsigned_hash || !credentialId) {
      return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE_CONTEXT" }, { status: 400 });
    }

    const tok = await digigoOauthToken({ code });

    if (!tok.ok) {
      return NextResponse.json({ ok: false, error: tok.error }, { status: 400 });
    }

    const sign = await digigoSignHash({
      credentialId,
      sad: tok.sad,
      hashes: [unsigned_hash],
    });

    if (!sign.ok) {
      return NextResponse.json({ ok: false, error: sign.error }, { status: 400 });
    }

    const signatureValue = s(sign.value);

    const signed_xml = injectSignature(unsigned_xml, signatureValue);
    const signed_hash = sha256Base64Utf8(signed_xml);

    await service
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_xml,
        signed_hash,
        signed_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoice_id);

    await service
      .from("invoices")
      .update({
        signature_status: "signed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);

    return NextResponse.json({
      ok: true,
      invoice_id,
    });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "CONFIRM_FAILED",
        message: String(e?.message || e),
      },
      { status: 500 }
    );
  }
}
