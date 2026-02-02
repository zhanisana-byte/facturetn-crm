import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
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
  const otp_id = s(body.otp_id);
  const otp = s(body.otp);

  if (!invoice_id || !otp_id || !otp) {
    return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
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

  const allowed = await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: sig } = await service
    .from("invoice_signatures")
    .select("meta, session_id, provider_tx_id, unsigned_xml, unsigned_hash")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  const meta = (sig as any)?.meta ?? {};
  const session_id = s((sig as any)?.session_id) || s(meta.session_id);
  const provider_tx_id = s((sig as any)?.provider_tx_id) || s(meta.transaction_id);

  const ctx = (meta as any)?.digigo_ctx ?? null;
  const toBeSignedWithParameters = ctx?.toBeSignedWithParameters ?? null;

  if (!session_id || !toBeSignedWithParameters) {
    return NextResponse.json({ ok: false, error: "MISSING_SIGNATURE_CONTEXT" }, { status: 400 });
  }

  const payload = {
    aspId: digigoAspId(),
    aspIp: digigoAspIp(),
    toBeSignedWithParameters,
  };

  let r = await digigoCall(`signDocumentWithOtp/${otp_id}/${otp}`, payload);
  if (!r.ok) {
    r = await digigoCall("signDocumentWithOtp", { ...payload, sessionId: session_id, otpId: otp_id, otp });
  }

  if (!r.ok) {
    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        signed_xml: "",
        provider_tx_id: provider_tx_id || null,
        session_id,
        otp_id,
        signer_user_id: auth.user.id,
        state: "sign_failed",
        meta: {
          ...meta,
          transaction_id: provider_tx_id || null,
          session_id,
          otp_id,
          state: "sign_failed",
          signer_user_id: auth.user.id,
          digigo_error: r.error || "DIGIGO_SIGN_FAILED",
        },
      },
      { onConflict: "invoice_id" }
    );

    return NextResponse.json({ ok: false, error: r.error || "DIGIGO_SIGN_FAILED", digigo: r.data ?? null }, { status: 502 });
  }

  const data = r.data as any;

  const bytesB64 =
    s(data?.bytes) ||
    s(data?.Bytes) ||
    s(data?.documentBytes) ||
    s(data?.signedBytes) ||
    "";

  const signedXmlText =
    s(data?.signedXml) ||
    s(data?.signed_xml) ||
    s(data?.documentSigned) ||
    "";

  let signedTeif = "";

  if (bytesB64) {
    try {
      signedTeif = Buffer.from(bytesB64, "base64").toString("utf8").trim();
    } catch {
      signedTeif = "";
    }
  }

  if (!signedTeif) {
    signedTeif = signedXmlText;
  }

  const looksSigned =
    signedTeif.includes("<ds:Signature") ||
    signedTeif.includes(":Signature");

  if (!signedTeif || !looksSigned) {
    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        signed_xml: "",
        provider_tx_id: provider_tx_id || null,
        session_id,
        otp_id,
        signer_user_id: auth.user.id,
        state: "invalid_signed_xml",
        meta: {
          ...meta,
          transaction_id: provider_tx_id || null,
          session_id,
          otp_id,
          state: "invalid_signed_xml",
          signer_user_id: auth.user.id,
          digigo_raw: data,
        },
      },
      { onConflict: "invoice_id" }
    );

    return NextResponse.json({ ok: false, error: "DIGIGO_NO_XML_SIGNATURE", digigo: data }, { status: 502 });
  }

  const signedHash = sha256Base64Utf8(signedTeif);
  const unsignedHash = s((sig as any)?.unsigned_hash) || s(meta.unsigned_hash) || null;
  const unsignedXml = s((sig as any)?.unsigned_xml) || s(meta.unsigned_xml) || null;

  const finalMeta = {
    ...meta,
    transaction_id: provider_tx_id || null,
    session_id,
    otp_id,
    state: "signed",
    signer_user_id: auth.user.id,
    unsigned_hash: unsignedHash,
    signed_hash: signedHash,
    unsigned_xml: unsignedXml ? null : null,
    digigo_raw: null,
  };

  const { error: upErr } = await service
    .from("invoice_signatures")
    .upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        signed_xml: signedTeif,
        signed_hash: signedHash,
        provider_tx_id: provider_tx_id || null,
        session_id,
        otp_id,
        signer_user_id: auth.user.id,
        state: "signed",
        meta: finalMeta,
      },
      { onConflict: "invoice_id" }
    );

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  await service.from("invoices").update({ ttn_status: "not_sent" }).eq("id", invoice_id);

  return NextResponse.json({ ok: true });
}
