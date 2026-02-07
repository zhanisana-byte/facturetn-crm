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
  if (process.env.NODE_ENV === "production") return;
  if (String(process.env.DIGIGO_ALLOW_INSECURE || "").toLowerCase() === "true") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
}

function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

function pickB64SignedBytes(data: any) {
  return (
    s(data?.bytes) ||
    s(data?.Bytes) ||
    s(data?.documentBytes) ||
    s(data?.signedBytes) ||
    ""
  );
}

function pickSignedXmlText(data: any) {
  return (
    s(data?.signedXml) ||
    s(data?.signed_xml) ||
    s(data?.documentSigned) ||
    ""
  );
}

function looksSignedXml(xml: string) {
  const x = s(xml);
  if (!x) return false;
  return x.includes("<ds:Signature") || x.includes(":Signature");
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

  const { data: sig, error: sigReadErr } = await service
    .from("invoice_signatures")
    .select("meta, session_id, provider_tx_id, unsigned_xml, unsigned_hash, company_id, environment")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  if (sigReadErr || !sig) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_CONTEXT_NOT_FOUND" }, { status: 404 });
  }

  const sigCompanyId = s((sig as any)?.company_id);
  if (sigCompanyId && sigCompanyId !== company_id) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_COMPANY_MISMATCH" }, { status: 400 });
  }

  const meta = ((sig as any)?.meta && typeof (sig as any).meta === "object") ? (sig as any).meta : {};
  const session_id = s((sig as any)?.session_id) || s(meta.session_id);
  const provider_tx_id = s((sig as any)?.provider_tx_id) || s(meta.transaction_id);

  const ctx = (meta as any)?.digigo_ctx ?? null;
  const toBeSignedWithParameters = ctx?.toBeSignedWithParameters ?? null;

  if (!session_id || !toBeSignedWithParameters) {
    return NextResponse.json({ ok: false, error: "MISSING_SIGNATURE_CONTEXT" }, { status: 400 });
  }

  const env = s((sig as any)?.environment || meta.environment || "production") || "production";

  const { data: cred, error: credErr } = await service
    .from("ttn_credentials")
    .select("signature_provider, signature_config, environment")
    .eq("company_id", company_id)
    .eq("environment", env)
    .maybeSingle();

  if (credErr || !cred) {
    return NextResponse.json({ ok: false, error: "TTN_NOT_CONFIGURED" }, { status: 400 });
  }

  const cfg =
    (cred as any)?.signature_config && typeof (cred as any).signature_config === "object"
      ? (cred as any).signature_config
      : {};

  const credentialId = s(cfg?.digigo_signer_email || "");
  if (!credentialId) {
    return NextResponse.json(
      {
        ok: false,
        error: "EMAIL_DIGIGO_COMPANY_MISSING",
        message: "Renseignez l’email DigiGo dans Paramètres DigiGo (société).",
      },
      { status: 400 }
    );
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
        environment: env,
        provider: "digigo",
        signed_xml: "",
        provider_tx_id: provider_tx_id || null,
        session_id,
        otp_id,
        signer_user_id: auth.user.id,
        state: "sign_failed",
        meta: {
          ...meta,
          credentialId,
          transaction_id: provider_tx_id || null,
          session_id,
          otp_id,
          state: "sign_failed",
          signer_user_id: auth.user.id,
          digigo_error: r.error || "DIGIGO_SIGN_FAILED",
        },
      } as any,
      { onConflict: "invoice_id" }
    );

    return NextResponse.json({ ok: false, error: r.error || "DIGIGO_SIGN_FAILED", digigo: r.data ?? null }, { status: 502 });
  }

  const data = r.data as any;

  const bytesB64 = pickB64SignedBytes(data);
  const signedXmlText = pickSignedXmlText(data);

  let signedTeif = "";

  if (bytesB64) {
    try {
      signedTeif = Buffer.from(bytesB64, "base64").toString("utf8").trim();
    } catch {
      signedTeif = "";
    }
  }

  if (!signedTeif) signedTeif = signedXmlText;

  if (!signedTeif || !looksSignedXml(signedTeif)) {
    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: env,
        provider: "digigo",
        signed_xml: "",
        provider_tx_id: provider_tx_id || null,
        session_id,
        otp_id,
        signer_user_id: auth.user.id,
        state: "invalid_signed_xml",
        meta: {
          ...meta,
          credentialId,
          transaction_id: provider_tx_id || null,
          session_id,
          otp_id,
          state: "invalid_signed_xml",
          signer_user_id: auth.user.id,
          digigo_raw: data,
        },
      } as any,
      { onConflict: "invoice_id" }
    );

    return NextResponse.json({ ok: false, error: "DIGIGO_NO_XML_SIGNATURE", digigo: data }, { status: 502 });
  }

  const signedHash = sha256Base64Utf8(signedTeif);
  const unsignedHash = s((sig as any)?.unsigned_hash) || s(meta.unsigned_hash) || null;

  const finalMeta = {
    ...meta,
    credentialId,
    transaction_id: provider_tx_id || null,
    session_id,
    otp_id,
    state: "signed",
    signer_user_id: auth.user.id,
    unsigned_hash: unsignedHash,
    signed_hash: signedHash,
    digigo_raw: null,
  };

  const { error: upErr } = await service
    .from("invoice_signatures")
    .upsert(
      {
        invoice_id,
        company_id,
        environment: env,
        provider: "digigo",
        signed_xml: signedTeif,
        signed_hash: signedHash,
        provider_tx_id: provider_tx_id || null,
        session_id,
        otp_id,
        signer_user_id: auth.user.id,
        state: "signed",
        meta: finalMeta,
      } as any,
      { onConflict: "invoice_id" }
    );

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  await service
    .from("invoices")
    .update({ ttn_status: "not_sent", signature_status: "signed", signature_provider: "digigo" })
    .eq("id", invoice_id);

  return NextResponse.json({ ok: true });
}
