import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { sha256Base64Utf8, digigoAuthorizeUrl, digigoRedirectUri } from "@/lib/digigo/client";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id);
    const back_url = s(body?.back_url);

    if (!invoice_id) {
      return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });

    const { data: invoice, error: invErr } = await supabase
      .from("invoice_signatures")
      .select("unsigned_xml, company_id")
      .eq("invoice_id", invoice_id)
      .single();

    if (invErr || !invoice?.unsigned_xml) {
      return NextResponse.json({ ok: false, error: "MISSING_UNSIGNED_XML" }, { status: 400 });
    }

    const { data: cred } = await supabase
      .from("ttn_credentials")
      .select("digigo_credential_id")
      .eq("company_id", invoice.company_id)
      .eq("environment", "production")
      .eq("is_active", true)
      .single();

    const credentialId = s(cred?.digigo_credential_id);
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_CREDENTIAL" }, { status: 400 });
    }

    const hash = sha256Base64Utf8(invoice.unsigned_xml);
    const state = randomUUID();

    await supabase.from("digigo_sign_sessions").insert({
      invoice_id,
      state,
      status: "pending",
      created_by: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      company_id: invoice.company_id,
      environment: "production",
    });

    const baseRedirect = digigoRedirectUri();
    const ru = new URL(baseRedirect);
    ru.searchParams.set("invoice_id", invoice_id);

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: hash,
      numSignatures: 1,
      state,
      redirectUri: ru.toString(),
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
      { ok: false, error: String(e?.message || "START_ERROR") },
      { status: 500 }
    );
  }
}
