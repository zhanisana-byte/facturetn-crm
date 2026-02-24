import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { sha256Base64Utf8, digigoAuthorizeUrl, digigoRedirectUri } from "@/lib/digigo/client";

function s(v: any) {
  return String(v ?? "").trim();
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id);
    const back_url = s(body?.back_url);

    if (!invoice_id) {
      return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });
    }

    const supabase = getSupabase();

    const { data: sig, error: sigErr } = await supabase
      .from("invoice_signatures")
      .select("unsigned_xml, company_id")
      .eq("invoice_id", invoice_id)
      .single();

    if (sigErr || !sig?.unsigned_xml) {
      return NextResponse.json({ ok: false, error: "MISSING_UNSIGNED_XML" }, { status: 400 });
    }

    const { data: company, error: companyErr } = await supabase
      .from("companies")
      .select("digigo_credential_id")
      .eq("id", sig.company_id)
      .single();

    if (companyErr || !company?.digigo_credential_id) {
      return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_CREDENTIAL" }, { status: 400 });
    }

    const hash = sha256Base64Utf8(sig.unsigned_xml);
    const state = randomUUID();

    await supabase.from("digigo_sign_sessions").insert({
      invoice_id,
      state,
      status: "pending",
      created_by: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      company_id: sig.company_id,
      environment: "production",
    });

    const baseRedirect = digigoRedirectUri();
    const ru = new URL(baseRedirect);
    ru.searchParams.set("invoice_id", invoice_id);

    const authorize_url = digigoAuthorizeUrl({
      credentialId: company.digigo_credential_id,
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
