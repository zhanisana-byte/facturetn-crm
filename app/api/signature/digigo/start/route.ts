import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAuthorizeUrl } from "@/lib/digigo/server";

export async function POST(req: NextRequest) {
  const service = createServiceClient();

  try {
    const body = await req.json();
    const invoice_id = body?.invoice_id;

    if (!invoice_id) {
      return NextResponse.json(
        { ok: false, error: "INVOICE_ID_MISSING" },
        { status: 400 }
      );
    }

    const { data: invoice, error: invoiceError } = await service
      .from("invoices")
      .select("id, company_id, unsigned_hash")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { ok: false, error: "INVOICE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const { data: company, error: companyError } = await service
      .from("companies")
      .select("digigo_signer_email")
      .eq("id", invoice.company_id)
      .single();

    if (companyError || !company?.digigo_signer_email) {
      return NextResponse.json(
        { ok: false, error: "DIGIGO_SIGNER_EMAIL_NOT_CONFIGURED" },
        { status: 400 }
      );
    }

    const credentialId = company.digigo_signer_email;

    const state = crypto.randomUUID();

    await service.from("digigo_sign_sessions").insert({
      invoice_id,
      state,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    const authorize_url = digigoAuthorizeUrl({
      state,
      hash: invoice.unsigned_hash,
      credentialId,
      numSignatures: 1,
    });

    return NextResponse.json({
      ok: true,
      authorize_url,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
