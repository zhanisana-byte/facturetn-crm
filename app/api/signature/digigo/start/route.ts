import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildTeifInvoiceXml, enforceMaxSize, validateTeifMinimum } from "@/lib/ttn/teifXml";
import { digigoAspId, digigoAspIp, digigoCall, digigoStartSession } from "@/lib/digigo/client";
import { sha256Base64Utf8 } from "@/lib/crypto/sha256";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const service = createServiceClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoice_id = s((body as any).invoice_id);

  if (!invoice_id) return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });

  const { data: invoice, error: eInv } = await supabase.from("invoices").select("*").eq("id", invoice_id).single();
  if (eInv || !invoice) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const company_id = s((invoice as any).company_id);
  if (!company_id) return NextResponse.json({ ok: false, error: "MISSING_COMPANY" }, { status: 400 });

  const { data: items, error: eItems } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoice_id)
    .order("line_no", { ascending: true });

  if (eItems) return NextResponse.json({ ok: false, error: "ITEMS_READ_FAILED" }, { status: 500 });

  const { data: company, error: eC } = await supabase.from("companies").select("*").eq("id", company_id).single();
  if (eC || !company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const { data: cred } = await supabase
    .from("ttn_credentials")
    .select("*")
    .eq("company_id", company_id)
    .eq("environment", "production")
    .maybeSingle();

  if (!cred) return NextResponse.json({ ok: false, error: "TTN_NOT_CONFIGURED" }, { status: 400 });

  const { data: idRow } = await supabase
    .from("user_digigo_identities")
    .select("phone,email,national_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const bodyPhone = s((body as any).phone);
  const bodyEmail = s((body as any).email);
  const bodyCin = s((body as any).national_id);

  const signerPhone = bodyPhone || s((idRow as any)?.phone);
  const signerEmail = bodyEmail || s((idRow as any)?.email);
  const signerCin = bodyCin || s((idRow as any)?.national_id);

  const fallbackEmail = s(auth.user.email);
  const finalEmail = signerEmail || fallbackEmail;
  const finalPhone = signerPhone;

  if (!finalEmail && !finalPhone) {
    return NextResponse.json({ ok: false, error: "IDENTITY_MISSING", need_identity: true }, { status: 400 });
  }

  if (!idRow && (finalEmail || finalPhone)) {
    await service.from("user_digigo_identities").upsert(
      {
        user_id: auth.user.id,
        phone: finalPhone || null,
        email: finalEmail || null,
        national_id: signerCin || null,
      },
      { onConflict: "user_id" }
    );
  }

  const session_id = await digigoStartSession();
  if (!session_id) return NextResponse.json({ ok: false, error: "DIGIGO_SESSION_FAILED" }, { status: 502 });

  const provider_tx_id = `digigo_${invoice_id}_${Date.now()}`;

  const meta: any = {
    provider: "digigo",
    company_id,
    invoice_id,
    user_id: auth.user.id,
    signer: { phone: finalPhone || null, email: finalEmail || null, cin: signerCin || null },
  };

  const teifXml = buildTeifInvoiceXml({
    company: {
      name: s((company as any)?.company_name ?? ""),
      taxId: s((company as any)?.tax_id ?? (company as any)?.taxId ?? ""),
      address: s((company as any)?.address ?? ""),
      city: s((company as any)?.city ?? ""),
      postalCode: s((company as any)?.postal_code ?? (company as any)?.zip ?? ""),
      country: s((company as any)?.country ?? "TN"),
    },
    invoice: {
      documentType: s((invoice as any)?.document_type ?? "facture"),
      number: s((invoice as any)?.invoice_number ?? ""),
      issueDate: s((invoice as any)?.issue_date ?? ""),
      currency: s((invoice as any)?.currency ?? "TND"),
      customerName: s((invoice as any)?.customer_name ?? ""),
      customerTaxId: s((invoice as any)?.customer_tax_id ?? ""),
      customerEmail: s((invoice as any)?.customer_email ?? ""),
      customerPhone: s((invoice as any)?.customer_phone ?? ""),
      customerAddress: s((invoice as any)?.customer_address ?? ""),
      notes: s((invoice as any)?.notes ?? ""),
    },
    totals: {
      ht: Number((invoice as any)?.subtotal_ht ?? 0),
      tva: Number((invoice as any)?.total_vat ?? (invoice as any)?.total_tva ?? 0),
      ttc: Number((invoice as any)?.total_ttc ?? 0),
      stampEnabled: true,
      stampAmount: Number((invoice as any)?.stamp_amount ?? (invoice as any)?.stamp_duty ?? 0),
    },
    items: (items ?? []).map((it: any) => ({
      description: s(it.description ?? ""),
      qty: Number(it.quantity ?? 1),
      price: Number(it.unit_price_ht ?? 0),
      vat: Number(it.vat_pct ?? 0),
      discount: Number(it.discount_pct ?? 0),
    })),
  });

  const problems = validateTeifMinimum(teifXml);
  if (problems.length) {
    return NextResponse.json({ ok: false, error: "TEIF_INVALID", details: problems }, { status: 400 });
  }

  const sized = enforceMaxSize(teifXml);
  const unsignedXml = sized.xml;
  const unsignedHash = sha256Base64Utf8(unsignedXml);
  const bytesB64 = Buffer.from(unsignedXml, "utf8").toString("base64");

  const signerAlias = finalEmail || finalPhone || "signer";

  const toBeSignedWithParameters = {
    sessionId: session_id,
    alias: signerAlias,
    signatureForm: "XAdES",
    digestAlgorithm: "SHA256",
    signatureLevel: "XAdES_BASELINE_B",
    signaturePackaging: "ENVELOPED",
    signatureVisible: false,
    bytes: bytesB64,
    name: `invoice_${invoice_id}.xml`,
    mimeType: "XML",
  };

  const reqPayload = {
    aspId: digigoAspId(),
    aspIp: digigoAspIp(),
    toBeSignedWithPwdAndParameters: {
      sessionId: session_id,
      alias: signerAlias,
      toBeSignedWithParameters,
    },
  };

  let r = await digigoCall("requestSignDocumentWithOtp", reqPayload);
  if (!r.ok) r = await digigoCall("requestSignWithOtp", reqPayload);

  if (!r.ok) {
    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        provider_tx_id,
        session_id,
        signer_user_id: auth.user.id,
        state: "otp_request_failed",
        unsigned_xml: unsignedXml,
        unsigned_hash: unsignedHash,
        meta: { ...meta, state: "otp_request_failed" },
      },
      { onConflict: "invoice_id" }
    );
    return NextResponse.json({ ok: false, error: "DIGIGO_REQUEST_SIGN_FAILED" }, { status: 502 });
  }

  const otp_id = s((r.data as any)?.otpId || (r.data as any)?.OTPID || "");
  if (!otp_id) return NextResponse.json({ ok: false, error: "DIGIGO_NO_OTP_ID" }, { status: 502 });

  await service.from("invoice_signatures").upsert(
    {
      invoice_id,
      company_id,
      environment: "production",
      provider: "digigo",
      provider_tx_id,
      session_id,
      otp_id,
      signer_user_id: auth.user.id,
      state: "otp_sent",
      unsigned_xml: unsignedXml,
      unsigned_hash: unsignedHash,
      meta: { ...meta, otp_id, state: "otp_sent", digigo_ctx: { toBeSignedWithParameters } },
    },
    { onConflict: "invoice_id" }
  );

  await service.from("invoices").update({ signature_status: "not_signed" }).eq("id", invoice_id);

  return NextResponse.json({ ok: true, otp_required: true, otp_id });
}
