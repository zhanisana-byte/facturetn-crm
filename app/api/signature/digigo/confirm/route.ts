import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractJwtJti, digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id);
    const state = s(body?.state);
    const tokenJwt = s(body?.token);

    if (!invoice_id) return NextResponse.json({ error: "MISSING_INVOICE_ID" }, { status: 400 });
    if (!state) return NextResponse.json({ error: "MISSING_STATE" }, { status: 400 });
    if (!tokenJwt) return NextResponse.json({ error: "MISSING_TOKEN_JWT" }, { status: 400 });

    const { data: sig, error: sigErr } = await sb
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoice_id)
      .eq("provider", "digigo")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sigErr || !sig) return NextResponse.json({ error: "SIGNATURE_ROW_NOT_FOUND" }, { status: 400 });

    const sigState = s(sig?.meta?.state);
    if (!sigState) return NextResponse.json({ error: "SIGNATURE_META_STATE_MISSING" }, { status: 400 });
    if (sigState !== state) return NextResponse.json({ error: "STATE_MISMATCH" }, { status: 400 });

    const unsignedHash = s(sig.unsigned_hash);
    const unsignedXml = s(sig.unsigned_xml);
    if (!unsignedHash || !unsignedXml) return NextResponse.json({ error: "MISSING_UNSIGNED_DATA" }, { status: 400 });

    const credentialId = s(sig?.meta?.credentialId || sig?.meta?.credential_id);
    if (!credentialId) return NextResponse.json({ error: "MISSING_CREDENTIAL_ID_IN_META" }, { status: 400 });

    const { jti } = extractJwtJti(tokenJwt);
    const { sad } = await digigoOauthTokenFromJti({ jti });

    const signed = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
      hashAlgo: "SHA256",
      signAlgo: "RSA",
    });

    const signatureValue = s((signed as any)?.value);
    if (!signatureValue) return NextResponse.json({ error: "SIGNATURE_EMPTY" }, { status: 400 });

    const signedXml = injectSignatureIntoTeifXml(unsignedXml, signatureValue);

    const now = new Date().toISOString();

    const { error: updSigErr } = await sb
      .from("invoice_signatures")
      .update({
        signed_xml: signedXml,
        signed_at: now,
        signed_hash: signatureValue,
        state: "signed",
        meta: { ...(sig.meta || {}), sad, jti, tokenJwt },
        updated_at: now,
      })
      .eq("id", sig.id);

    if (updSigErr) return NextResponse.json({ error: "SIGNATURE_UPDATE_FAILED" }, { status: 500 });

    await sb.from("invoices").update({ signature_status: "signed", signed_at: now, updated_at: now }).eq("id", invoice_id);

    await sb.from("digigo_sign_sessions").update({ status: "callback_ok", updated_at: now }).eq("invoice_id", invoice_id).eq("state", state);

    return NextResponse.json({ ok: true, invoice_id, state });
  } catch (e: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", details: String(e?.message || e) }, { status: 500 });
  }
}
