import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { digigoAuthorizeUrl } from "@/lib/digigo/client";
import { sha256Base64Utf8 } from "@/lib/crypto/sha256";
import { teifFromInvoice } from "@/lib/ttn/teif";
import { getInvoice } from "@/lib/invoices/getInvoice";
import { getUserIdOrThrow } from "@/lib/auth/getUserId";
import { randomUUID } from "crypto";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const admin = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const invoiceId = s(body?.invoice_id);
  const credentialId = s(body?.credential_id);
  const backUrl = s(body?.back_url);

  if (!invoiceId) {
    return NextResponse.json({ error: "MISSING_INVOICE_ID" }, { status: 400 });
  }
  if (!credentialId) {
    return NextResponse.json({ error: "MISSING_CREDENTIAL_ID" }, { status: 400 });
  }

  const signerUserId = await getUserIdOrThrow();
  const invoice = await getInvoice(admin, invoiceId);

  if (!invoice) {
    return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });
  }

  const unsignedXml = teifFromInvoice(invoice);
  const unsignedHash = sha256Base64Utf8(unsignedXml);

  const state = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  const { error: upsertErr } = await admin.from("invoice_signatures").upsert(
    {
      invoice_id: invoiceId,
      provider: "digigo",
      state: "pending",
      unsigned_xml: unsignedXml,
      unsigned_hash: unsignedHash,
      signed_xml: null,
      signed_at: null,
      session_id: null,
      otp_id: null,
      error_message: null,
      company_id: invoice.company_id,
      environment: "production",
      signer_user_id: signerUserId,
      meta: {
        state,
        back_url: backUrl || `/invoices/${invoiceId}`,
        credentialId,
      },
      signed_hash: null,
      updated_at: now.toISOString(),
    },
    { onConflict: "invoice_id,provider,environment" }
  );

  if (upsertErr) {
    return NextResponse.json({ error: "SIGNATURE_UPSERT_FAILED", details: upsertErr.message }, { status: 500 });
  }

  const { error: sessErr } = await admin.from("digigo_sign_sessions").insert({
    invoice_id: invoiceId,
    state,
    back_url: backUrl || `/invoices/${invoiceId}`,
    status: "pending",
    created_by: signerUserId,
    company_id: invoice.company_id,
    environment: "production",
    expires_at: expiresAt.toISOString(),
    digigo_jti: null,
    error_message: null,
  });

  if (sessErr) {
    return NextResponse.json({ error: "SESSION_CREATE_FAILED", details: sessErr.message }, { status: 500 });
  }

  const authorizeUrl = digigoAuthorizeUrl({
    state,
  });

  return NextResponse.json({
    authorize_url: authorizeUrl,
  });
}
