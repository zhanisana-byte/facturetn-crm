// app/api/signature/digigo/confirm/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractJwtJti, digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const invoice_id = body?.invoice_id;
    const state = body?.state;
    const tokenJwt = body?.token; // IMPORTANT: token JWT de redirect

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

    const sigState = sig?.meta?.state;
    if (!sigState) return NextResponse.json({ error: "SIGNATURE_META_STATE_MISSING" }, { status: 400 });
    if (String(sigState) !== String(state)) return NextResponse.json({ error: "STATE_MISMATCH" }, { status: 400 });

    const unsignedHash = String(sig.unsigned_hash || "").trim();
    const unsignedXml = String(sig.unsigned_xml || "").trim();

    if (!unsignedHash || !unsignedXml) return NextResponse.json({ error: "MISSING_UNSIGNED_DATA" }, { status: 400 });

    // 1) token JWT -> jti
    const { jti } = extractJwtJti(tokenJwt);

    // 2) oauth2/token -> sad
    const { sad } = await digigoOauthTokenFromJti({ jti });

    // 3) signatures/signHash -> valeur signée (Base64)
    const credentialId = String(sig?.meta?.credentialId || sig?.meta?.credential_id || "").trim();
    if (!credentialId) return NextResponse.json({ error: "MISSING_CREDENTIAL_ID_IN_META" }, { status: 400 });

    const signed = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
      hashAlgo: "SHA256",
      signAlgo: "RSA",
    });

    const signatureValue = String(signed.value || "").trim();
    if (!signatureValue) return NextResponse.json({ error: "SIGNATURE_EMPTY" }, { status: 400 });

    // NOTE: ici tu dois injecter proprement la signature dans TON XML (XAdES/XMLDSig),
    // pas un simple <Signature> brut. Je laisse tel quel pour ne pas casser ton flow.
    const signedXml = unsignedXml.replace("</Invoice>", `<Signature>${signatureValue}</Signature></Invoice>`);

    const { error: updSigErr } = await sb
      .from("invoice_signatures")
      .update({
        signed_xml: signedXml,
        signed_at: new Date().toISOString(),
        signed_hash: signatureValue,
        state: "signed",
        meta: {
          ...(sig.meta || {}),
          sad,
          jti,
          tokenJwt,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", sig.id);

    if (updSigErr) return NextResponse.json({ error: "SIGNATURE_UPDATE_FAILED" }, { status: 500 });

    await sb
      .from("invoices")
      .update({ signature_status: "signed", signed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", invoice_id);

    await sb
      .from("digigo_sign_sessions")
      .update({ status: "callback_ok", updated_at: new Date().toISOString() })
      .eq("invoice_id", invoice_id)
      .eq("state", state);

    return NextResponse.json({ ok: true, invoice_id, state, sad });
  } catch (e: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", details: String(e?.message || e) }, { status: 500 });
  }
}
