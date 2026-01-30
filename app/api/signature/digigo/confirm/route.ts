import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import { digigoCall, digigoAspId, digigoAspIp } from "@/lib/signature/digigoClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

/**
 * DigiGO - Confirmation OTP + récupération document signé.
 * Requiert:
 * - invoice_id
 * - otp_id
 * - otp
 *
 * Le start() a déjà :
 * - authentifié l'utilisateur (PIN)
 * - demandé un otpId (requestSignWithOtp)
 * - stocké unsigned_xml dans invoice_signatures.meta (fallback).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
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
    .select("id,company_id")
    .eq("id", invoice_id)
    .maybeSingle();

  const company_id = String((inv as any)?.company_id || "");
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
    .select("meta")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  const meta = (sig as any)?.meta ?? {};
  const session_id = s(meta.session_id);
  const unsigned_xml = s(meta.unsigned_xml);

  if (!session_id) {
    return NextResponse.json({ ok: false, error: "NO_SESSION" }, { status: 400 });
  }

  // Appel DigiGO: signDocumentWithOtp
  // Doc: POST /signDocumentWithOtp/{otpId}/{otpValue} avec body toBeSignedWithParameters
  const toBeSignedWithParameters = meta?.toBeSignedWithParameters ?? null;

  if (!toBeSignedWithParameters) {
    return NextResponse.json({ ok: false, error: "MISSING_SIGNATURE_CONTEXT" }, { status: 400 });
  }

  const payload = {
    aspId: digigoAspId(),
    aspIp: digigoAspIp(),
    toBeSignedWithParameters,
  };

  // On supporte la forme URL-paramétrée (doc) + fallback camelCase
  let r = await digigoCall(`signDocumentWithOtp/${otp_id}/${otp}`, payload);
  if (!r.ok) {
    r = await digigoCall("signDocumentWithOtp", { ...payload, sessionId: session_id, otpId: otp_id, otp });
  }
  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.error || "DIGIGO_SIGN_FAILED", digigo: r.data ?? null },
      { status: 502 }
    );
  }

  const data = r.data as any;

  // --- FIX VERCEL: la variable signedXml doit exister (sinon TS casse le build)
  const signedXml =
    s(data?.signedXml) ||
    s(data?.signed_xml) ||
    s(data?.documentSigned) ||
    "";

  // DigiGo (doc) renvoie souvent un document signé en binaire (Bytes/bytes) + métadonnées.
  const bytesB64 =
    s(data?.bytes) ||
    s(data?.Bytes) ||
    s(data?.documentBytes) ||
    s(data?.signedBytes) ||
    "";

  let finalSignedTeif = "";

  if (bytesB64) {
    try {
      finalSignedTeif = Buffer.from(bytesB64, "base64").toString("utf8").trim();
    } catch {
      finalSignedTeif = "";
    }
  }

  // Fallback: certaines implémentations renvoient directement du XML signé en texte
  if (!finalSignedTeif) {
    const maybeXml = signedXml;
    finalSignedTeif = maybeXml || (typeof data === "string" ? data : JSON.stringify(data));
  }

  // Garde-fou: on attend un TEIF/XML signé (présence d'une signature XMLDSIG)
  const looksSigned =
    finalSignedTeif.includes("<ds:Signature") ||
    finalSignedTeif.includes(":Signature");

  if (!looksSigned) {
    // On n'écrase pas l'état "signed" si le retour n'est pas exploitable TEIF/TTN
    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        signed_xml: null,
        meta: {
          ...meta,
          otp_id,
          state: "sign_failed",
          signer_user_id: auth.user.id,
          digigo_raw: data,
        },
      },
      { onConflict: "invoice_id" }
    );

    return NextResponse.json(
      { ok: false, error: "DIGIGO_NO_XML_SIGNATURE", digigo: data },
      { status: 502 }
    );
  }

  // Si l'API ne renvoie pas directement l'XML signé, on garde aussi le non signé pour debug.
  const finalMeta = {
    ...meta,
    otp_id,
    state: "signed",
    signer_user_id: auth.user.id,
    // si signedXml existe, on évite de stocker tout le raw (souvent très lourd)
    digigo_raw: signedXml ? null : data,
    unsigned_xml: unsigned_xml || null,
  };

  const { error: upErr } = await service
    .from("invoice_signatures")
    .upsert(
      {
        invoice_id,
        company_id,
        environment: "production",
        provider: "digigo",
        signed_xml: finalSignedTeif,
        meta: finalMeta,
      },
      { onConflict: "invoice_id" }
    );

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  // Sortie de l'état "pending_signature"
  await service.from("invoices").update({ ttn_status: "not_sent" }).eq("id", invoice_id);

  return NextResponse.json({ ok: true });
}
