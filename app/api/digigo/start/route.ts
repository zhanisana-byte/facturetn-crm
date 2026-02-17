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
      return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
    }

    const inv = await service
      .from("invoices")
      .select("id, company_id")
      .eq("id", invoice_id)
      .maybeSingle();

    if (inv.error) {
      return NextResponse.json({ ok: false, error: "INVOICE_FETCH_ERROR", details: inv.error.message }, { status: 500 });
    }
    if (!inv.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const company = await service
      .from("companies")
      .select("id, digigo_credential_id")
      .eq("id", inv.data.company_id)
      .maybeSingle();

    if (company.error) {
      return NextResponse.json({ ok: false, error: "COMPANY_FETCH_ERROR", details: company.error.message }, { status: 500 });
    }

    const credentialId = s(company.data?.digigo_credential_id || "");
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

    const state = uuid();
    const unsigned_hash = sha256Base64Utf8(`invoice:${invoice_id}:${state}`);

    const up = await service
      .from("digigo_sign_sessions")
      .insert({
        invoice_id,
        state,
        unsigned_hash,
        back_url,
        status: "started",
        credential_id: credentialId,
      })
      .select("id")
      .single();

    if (up.error) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_ERROR", details: up.error.message }, { status: 500 });
    }

    const authorizeUrl = digigoAuthorizeUrl({
      credentialId,
      state,
    });

    console.log("DIGIGO_AUTHORIZE_URL:", authorizeUrl);

    return NextResponse.json({
      ok: true,
      authorizeUrl,
      session_id: up.data.id,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: s(e?.message || "UNKNOWN") }, { status: 500 });
  }
}
