import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DigigoEnv, digigoGetSad, digigoOauthToken, digigoSignHash, isLikelyJwt } from "@/lib/digigo/server";

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
    const codeOrToken = body?.code;

    if (!invoice_id) return NextResponse.json({ error: "MISSING_INVOICE_ID" }, { status: 400 });
    if (!state) return NextResponse.json({ error: "MISSING_STATE" }, { status: 400 });
    if (!codeOrToken) return NextResponse.json({ error: "MISSING_CODE_OR_TOKEN" }, { status: 400 });

    const { data: inv, error: invErr } = await sb
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invErr || !inv) return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const companyId = inv.company_id;

    const { data: creds, error: credErr } = await sb
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credErr || !creds) return NextResponse.json({ error: "TTN_CREDENTIALS_NOT_FOUND" }, { status: 400 });

    const envText =
      String((creds as any).environment || "production").toLowerCase() === "production"
        ? "production"
        : "test";

    const environment = (envText === "production" ? "PROD" : "TEST") as DigigoEnv;

    const { data: sig, error: sigErr } = await sb
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoice_id)
      .eq("provider", "digigo")
      .eq("environment", envText)
      .single();

    if (sigErr || !sig) return NextResponse.json({ error: "SIGNATURE_ROW_NOT_FOUND" }, { status: 400 });

    const sigState = sig?.meta?.state;
    if (!sigState) return NextResponse.json({ error: "SIGNATURE_META_STATE_MISSING" }, { status: 400 });
    if (String(sigState) !== String(state)) return NextResponse.json({ error: "STATE_MISMATCH" }, { status: 400 });

    const unsignedHash = sig.unsigned_hash;
    const unsignedXml = sig.unsigned_xml;

    if (!unsignedHash || !unsignedXml) return NextResponse.json({ error: "MISSING_UNSIGNED_DATA" }, { status: 400 });

    const accessToken = isLikelyJwt(codeOrToken)
      ? codeOrToken
      : (await digigoOauthToken({ code: codeOrToken, environment })).accessToken;

    const sad = await digigoGetSad({ accessToken, environment });

    const signed = await digigoSignHash({
      accessToken,
      hash: unsignedHash,
      environment,
    });

    const signatureValue = String(signed.signature || "");

    if (!signatureValue) return NextResponse.json({ error: "SIGNATURE_EMPTY" }, { status: 400 });

    const signedXml = unsignedXml.replace("</Invoice>", `<Signature>${signatureValue}</Signature></Invoice>`);

    const { error: updSigErr } = await sb
      .from("invoice_signatures")
      .update({
        signed_xml: signedXml,
        signed_at: new Date().toISOString(),
        signed_hash: signatureValue,
        state: "signed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sig.id);

    if (updSigErr) return NextResponse.json({ error: "SIGNATURE_UPDATE_FAILED" }, { status: 500 });

    const { error: updInvErr } = await sb
      .from("invoices")
      .update({
        signature_status: "signed",
        signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);

    if (updInvErr) return NextResponse.json({ error: "INVOICE_UPDATE_FAILED" }, { status: 500 });

    const { error: sessUpdErr } = await sb
      .from("digigo_sign_sessions")
      .update({
        status: "callback_ok",
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoice_id)
      .eq("state", state);

    if (sessUpdErr) {
      return NextResponse.json({ error: "SESSION_UPDATE_FAILED", details: String(sessUpdErr.message || sessUpdErr) }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      invoice_id,
      state,
      sad,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", details: String(e?.message || e) }, { status: 500 });
  }
}
