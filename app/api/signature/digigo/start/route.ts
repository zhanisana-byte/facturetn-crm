import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  sha256Base64Utf8,
  digigoAuthorizeUrl,
} from "@/lib/digigo/server";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const invoice_id = body?.invoice_id;
    const credentialId = String(body?.credentialId || "").trim();

    if (!invoice_id)
      return NextResponse.json({ error: "MISSING_INVOICE_ID" }, { status: 400 });

    if (!credentialId)
      return NextResponse.json({ error: "MISSING_CREDENTIAL_ID" }, { status: 400 });

    const { data: invoice, error: invErr } = await sb
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .maybeSingle();

    if (invErr || !invoice)
      return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const unsignedXml = String(invoice?.xml_unsigned || "").trim();
    if (!unsignedXml)
      return NextResponse.json({ error: "UNSIGNED_XML_MISSING" }, { status: 400 });

    const unsignedHash = sha256Base64Utf8(unsignedXml);
    const state = randomUUID();

    const authorizeUrl = digigoAuthorizeUrl({
      state,
      hashBase64: unsignedHash,
      credentialId,
      numSignatures: 1,
    });

    const { error: sigErr } = await sb
      .from("invoice_signatures")
      .upsert(
        {
          invoice_id,
          provider: "digigo",
          unsigned_xml: unsignedXml,
          unsigned_hash: unsignedHash,
          state: "pending",
          meta: {
            state,
            credentialId,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "invoice_id,provider" }
      );

    if (sigErr)
      return NextResponse.json({ error: "SIGNATURE_SAVE_FAILED" }, { status: 500 });

    const { error: sessErr } = await sb
      .from("digigo_sign_sessions")
      .insert({
        invoice_id,
        state,
        status: "started",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (sessErr)
      return NextResponse.json({ error: "SESSION_SAVE_FAILED" }, { status: 500 });

    return NextResponse.json({
      ok: true,
      invoice_id,
      state,
      authorizeUrl,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
