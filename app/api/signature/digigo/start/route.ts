import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function uuid() {
  return crypto.randomUUID();
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: Request) {
  try {
    const service = getServiceClient();
    const body = await req.json().catch(() => ({}));

    const invoice_id = s(body?.invoice_id || "");
    const back_url = s(body?.back_url || "");

    if (!invoice_id) {
      return NextResponse.json(
        { ok: false, error: "INVOICE_ID_MISSING" },
        { status: 400 }
      );
    }

    const { data: invoice, error: invoiceError } = await service
      .from("invoices")
      .select("id, company_id")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      console.error("INVOICE_FETCH_ERROR:", invoiceError);
      return NextResponse.json(
        {
          ok: false,
          error: "INVOICE_FETCH_ERROR",
          details: invoiceError?.message,
        },
        { status: 500 }
      );
    }

    const { data: company, error: companyError } = await service
      .from("companies")
      .select("*")
      .eq("id", invoice.company_id)
      .single();

    if (companyError || !company) {
      console.error("COMPANY_FETCH_ERROR:", companyError);
      return NextResponse.json(
        {
          ok: false,
          error: "COMPANY_FETCH_ERROR",
          details: companyError?.message,
        },
        { status: 500 }
      );
    }

    const credentialId = s(company.digigo_credential_id);

    if (!credentialId) {
      return NextResponse.json(
        { ok: false, error: "DIGIGO_CREDENTIAL_ID_MISSING" },
        { status: 400 }
      );
    }

    const state = uuid();
    const unsigned_hash = sha256Base64Utf8(
      `invoice:${invoice_id}:${state}`
    );

    const { error: sessionError } = await service
      .from("digigo_sign_sessions")
      .insert({
        invoice_id,
        state,
        unsigned_hash,
        back_url,
        status: "started",
        credential_id: credentialId,
      });

    if (sessionError) {
      console.error("SESSION_CREATE_ERROR:", sessionError);
      return NextResponse.json(
        {
          ok: false,
          error: "SESSION_CREATE_ERROR",
          details: sessionError.message,
        },
        { status: 500 }
      );
    }

    const authorizeUrl = digigoAuthorizeUrl({
      credentialId,
      state,
    });

    return NextResponse.json({
      ok: true,
      authorizeUrl,
    });
  } catch (e: any) {
    console.error("START_ERROR:", e);
    return NextResponse.json(
      { ok: false, error: s(e?.message || "UNKNOWN") },
      { status: 500 }
    );
  }
}
