import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import { buildCompactTeifXml, validateTeifMinimum, enforceMaxSize } from "@/lib/ttn/teif";
import { digigoCall, digigoAspId, digigoAspIp } from "@/lib/signature/digigoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function maybeAllowInsecureTls() {
  if (process.env.NODE_ENV === "production") return; // Audit protection: enforce strict TLS in prod
  if (String(process.env.DIGIGO_ALLOW_INSECURE || "").toLowerCase() === "true") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}

function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  maybeAllowInsecureTls();

  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body.invoice_id);
  const pin = s(body.pin);
  const identity = body.identity ?? null;

  if (!invoice_id) {
    return NextResponse.json({ ok: false, error: "invoice_id required" }, { status: 400 });
  }

  const { data: inv } = await supabase
    .from("invoices")
    .select("id,company_id,ttn_status")
    .eq("id", invoice_id)
    .maybeSingle();

  const company_id = s((inv as any)?.company_id);
  if (!company_id) {
    return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
  }

  const ttnStatus = s((inv as any)?.ttn_status || "not_sent");
  if (ttnStatus !== "not_sent" && ttnStatus !== "pending_signature") {
    return NextResponse.json({ ok: false, error: "INVOICE_LOCKED_TTN" }, { status: 409 });
  }

  const allowed = await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const { data: viewRow } = await supabase
    .from("invoice_signature_views")
    .select("id")
    .eq("invoice_id", invoice_id)
    .eq("viewed_by", auth.user.id)
    .maybeSingle();

  if (!viewRow) {
    return NextResponse.json({ ok: false, error: "MUST_VIEW_INVOICE" }, { status: 409 });
  }

  const service = createServiceClient();

  let { data: idRow } = await supabase
    .from("user_digigo_identities")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!idRow && identity) {
    const phone = s(identity.phone);
    const email = s(identity.email);
    const national_id = s(identity.national_id);

    if (!phone && !email) {
      return NextResponse.json({ ok: false, error: "identity.phone or identity.email required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("user_digigo_identities")
      .upsert(
        {
          user_id: auth.user.id,
          phone: phone || null,
          email: email || null,
          national_id: national_id || null,
        },
        { onConflict: "user_id" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const { data: fresh } = await supabase
      .from("user_digigo_identities")
      .select("*")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    idRow = fresh as any;
  }

  if (!idRow) {
    return NextResponse.json({ ok: true, need_identity: true });
  }

  const signerPhone = s((idRow as any).phone);
  const signerEmail = s((idRow as any).email);
  const signerNationalId = s((idRow as any).national_id);

  const { data: sig } = await service
    .from("invoice_signatures")
    .select("meta, provider_tx_id, session_id, otp_id, state")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  const meta = (sig as any)?.meta ?? {};
  const provider_tx_id = s((sig as any)?.provider_tx_id) || s(meta.transaction_id) || `digigo_${crypto.randomUUID()}`;
  const session_id = s((sig as any)?.session_id) || s(meta.session_id);
  const otp_id_existing = s((sig as any)?.otp_id) || s(meta.otp_id);
  const state = s((sig as any)?.state) || s(meta.state);

  if (!session_id) {
    const payload = {
      aspId: digigoAspId(),
      aspIp: digigoAspIp(),
      phone: signerPhone || null,
      email: signerEmail || null,
      nationalId: signerNationalId || null,
    };

    const r = await digigoCall("getOtptAuth", payload);
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error || "DIGIGO_AUTH_START_FAILED" }, { status: 502 });
    }

    const newSessionId = s((r.data as any)?.sessionId || (r.data as any)?.session_id || "");
    if (!newSessionId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_NO_SESSION_ID" }, { status: 502 });
    }

    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        signed_xml: (sig as any)?.signed_xml ?? "",
        provider_tx_id,
        session_id: newSessionId,
        otp_id: otp_id_existing || null,
        signer_user_id: auth.user.id,
        state: "pin_sent",
        meta: {
          ...meta,
          transaction_id: provider_tx_id,
          session_id: newSessionId,
          state: "pin_sent",
          signer_user_id: auth.user.id,
        },
      },
      { onConflict: "invoice_id" }
    );

    await service.from("invoices").update({ ttn_status: "pending_signature" }).eq("id", invoice_id);

    return NextResponse.json({ ok: true, need_pin: true });
  }

  if (!pin) {
    return NextResponse.json({ ok: true, need_pin: true });
  }

  let a = await digigoCall("setOtpAuth", {
    aspId: digigoAspId(),
    aspIp: digigoAspIp(),
    sessionId: session_id,
    otpvalue: pin,
    pin,
  });

  if (!a.ok) {
    a = await digigoCall(`set-otp-auth/${session_id}`, {
      aspId: digigoAspId(),
      aspIp: digigoAspIp(),
      otpvalue: pin,
    });
  }

  if (!a.ok) {
    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        signed_xml: (sig as any)?.signed_xml ?? "",
        provider_tx_id,
        session_id,
        otp_id: otp_id_existing || null,
        signer_user_id: auth.user.id,
        state: "pin_failed",
        meta: {
          ...meta,
          transaction_id: provider_tx_id,
          session_id,
          state: "pin_failed",
          signer_user_id: auth.user.id,
        },
      },
      { onConflict: "invoice_id" }
    );

    return NextResponse.json({ ok: false, error: "DIGIGO_PIN_FAILED" }, { status: 502 });
  }

  const [{ data: items }, { data: invoice }, { data: company }] = await Promise.all([
    service.from("invoice_items").select("*").eq("invoice_id", invoice_id).order("line_no", { ascending: true }),
    service.from("invoices").select("*").eq("id", invoice_id).single(),
    service.from("companies").select("*").eq("id", company_id).single(),
  ]);

  const teifXml = buildCompactTeifXml({
    invoiceId: s(invoice.id),
    companyId: s(company.id),
    documentType: s(invoice.document_type ?? "facture"),
    invoiceNumber: s(invoice.invoice_number ?? ""),
    issueDate: s(invoice.issue_date ?? invoice.created_at ?? ""),
    dueDate: s(invoice.due_date ?? ""),
    currency: s(invoice.currency ?? "TND"),
    supplier: {
      name: s(company.company_name ?? ""),
      taxId: s(company.tax_id ?? ""),
      address: s(company.address ?? ""),
      city: s(company.city ?? ""),
      postalCode: s(company.postal_code ?? ""),
      country: s(company.country ?? "TN"),
    },
    customer: {
      name: s(invoice.customer_name ?? ""),
      taxId: (invoice.customer_tax_id ?? null) as string | null,
      address: s(invoice.customer_address ?? ""),
      city: s(invoice.customer_city ?? ""),
      postalCode: s(invoice.customer_postal_code ?? ""),
      country: s(invoice.customer_country ?? "TN"),
    },
    totals: {
      ht: Number(invoice.total_ht ?? 0),
      tva: Number(invoice.total_tva ?? 0),
      ttc: Number(invoice.total_ttc ?? 0),
      stampEnabled: Boolean(invoice.stamp_enabled ?? false),
      stampAmount: Number(invoice.stamp_amount ?? 0),
    },
    notes: s(invoice.notes ?? ""),
    items: (items ?? []).map((it: any) => ({
      description: s(it.description ?? ""),
      qty: Number(it.qty ?? 1),
      price: Number(it.price ?? 0),
      vat: Number(it.vat ?? 0),
      discount: Number(it.discount ?? 0),
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

  const signerAlias = signerEmail || signerPhone || auth.user.email || "signer";

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
  if (!r.ok) {
    r = await digigoCall("requestSignWithOtp", reqPayload);
  }

  if (!r.ok) {
    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        signed_xml: (sig as any)?.signed_xml ?? "",
        provider_tx_id,
        session_id,
        signer_user_id: auth.user.id,
        state: "otp_request_failed",
        unsigned_xml: unsignedXml,
        unsigned_hash: unsignedHash,
        meta: {
          ...meta,
          transaction_id: provider_tx_id,
          session_id,
          state: "otp_request_failed",
          signer_user_id: auth.user.id,
        },
      },
      { onConflict: "invoice_id" }
    );

    return NextResponse.json({ ok: false, error: "DIGIGO_REQUEST_SIGN_FAILED" }, { status: 502 });
  }

  const otp_id = s((r.data as any)?.otpId || (r.data as any)?.OTPID || "");
  if (!otp_id) {
    return NextResponse.json({ ok: false, error: "DIGIGO_NO_OTP_ID" }, { status: 502 });
  }

  await service.from("invoice_signatures").upsert(
    {
      invoice_id,
      company_id,
      environment: "production",
      provider: "digigo",
      signed_xml: (sig as any)?.signed_xml ?? "",
      provider_tx_id,
      session_id,
      otp_id,
      signer_user_id: auth.user.id,
      state: "otp_sent",
      unsigned_xml: unsignedXml,
      unsigned_hash: unsignedHash,
      meta: {
        ...meta,
        transaction_id: provider_tx_id,
        session_id,
        otp_id,
        state: "otp_sent",
        signer_user_id: auth.user.id,
        digigo_ctx: { toBeSignedWithParameters },
      },
    },
    { onConflict: "invoice_id" }
  );

  await service.from("invoices").update({ ttn_status: "pending_signature" }).eq("id", invoice_id);

  return NextResponse.json({ ok: true, otp_required: true, otp_id });
}
