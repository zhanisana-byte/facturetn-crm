import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { extractJwtJti, digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function s(v: any) {
  return String(v ?? "").trim();
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function pickSessionFromCookiesOrLatest() {
  const jar = await cookies();
  const cookieState = s(jar.get("digigo_state")?.value);
  const cookieInvoiceId = s(jar.get("digigo_invoice_id")?.value);
  const cookieBackUrl = s(jar.get("digigo_back_url")?.value);

  if (cookieState && cookieInvoiceId && isUuid(cookieInvoiceId)) {
    const { data: sess } = await sb
      .from("digigo_sign_sessions")
      .select("*")
      .eq("invoice_id", cookieInvoiceId)
      .eq("state", cookieState)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sess) return { sess, backUrl: cookieBackUrl || s(sess.back_url) || `/invoices/${cookieInvoiceId}` };
  }

  const { data: latest } = await sb
    .from("digigo_sign_sessions")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latest) return { sess: null as any, backUrl: "" };

  const invoiceId = s(latest.invoice_id);
  return { sess: latest, backUrl: s(latest.back_url) || (invoiceId ? `/invoices/${invoiceId}` : "") };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const tokenJwt = s(body?.token);

    if (!tokenJwt) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });

    const { sess, backUrl } = await pickSessionFromCookiesOrLatest();
    if (!sess) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });

    const invoice_id = s(sess.invoice_id);
    const state = s(sess.state);
    if (!invoice_id || !isUuid(invoice_id)) return NextResponse.json({ ok: false, error: "BAD_INVOICE_ID" }, { status: 400 });
    if (!state) return NextResponse.json({ ok: false, error: "BAD_STATE" }, { status: 400 });

    const { jti } = extractJwtJti(tokenJwt);
    const now = new Date().toISOString();

    await sb
      .from("digigo_sign_sessions")
      .update({ status: "done", digigo_jti: jti, updated_at: now })
      .eq("id", sess.id);

    const { data: sig, error: sigErr } = await sb
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoice_id)
      .eq("provider", "digigo")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sigErr || !sig) return NextResponse.json({ ok: false, error: "SIGNATURE_ROW_NOT_FOUND" }, { status: 400 });

    const sigState = s(sig?.meta?.state);
    if (!sigState) return NextResponse.json({ ok: false, error: "SIGNATURE_META_STATE_MISSING" }, { status: 400 });
    if (sigState !== state) return NextResponse.json({ ok: false, error: "STATE_MISMATCH" }, { status: 400 });

    const unsignedHash = s(sig.unsigned_hash);
    const unsignedXml = s(sig.unsigned_xml);
    if (!unsignedHash || !unsignedXml) return NextResponse.json({ ok: false, error: "MISSING_UNSIGNED_DATA" }, { status: 400 });

    const credentialId = s(sig?.meta?.credentialId || sig?.meta?.credential_id);
    if (!credentialId) return NextResponse.json({ ok: false, error: "MISSING_CREDENTIAL_ID_IN_META" }, { status: 400 });

    const { sad } = await digigoOauthTokenFromJti({ jti });

    const signed = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
      hashAlgo: "SHA256",
      signAlgo: "RSA",
    });

    const signatureValue = s((signed as any)?.value);
    if (!signatureValue) return NextResponse.json({ ok: false, error: "SIGNATURE_EMPTY" }, { status: 400 });

    const signedXml = injectSignatureIntoTeifXml(unsignedXml, signatureValue);

    const upd = await sb
      .from("invoice_signatures")
      .update({
        signed_xml: signedXml,
        signed_at: now,
        signed_hash: signatureValue,
        state: "signed",
        meta: { ...(sig.meta || {}), tokenJwt, jti, sad },
        updated_at: now,
      })
      .eq("id", sig.id);

    if (upd.error) return NextResponse.json({ ok: false, error: "SIGNATURE_UPDATE_FAILED", details: upd.error.message }, { status: 500 });

    await sb.from("invoices").update({ signature_status: "signed", signed_at: now, updated_at: now }).eq("id", invoice_id);

    return NextResponse.json({ ok: true, invoice_id, state, back_url: backUrl || `/invoices/${invoice_id}` });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", details: s(e?.message || e) }, { status: 500 });
  }
}
