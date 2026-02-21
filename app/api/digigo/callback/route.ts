import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoVerifyToken, digigoFetchSignedXml } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}
function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  const svc = createServiceClient();

  try {
    const body = await req.json().catch(() => ({}));

    const token = s(body.token);
    const code = s(body.code);
    const invoice_id_from_body = s(body.invoice_id);

    const c = await cookies();
    const state_cookie = s(c.get("digigo_state")?.value || "");
    const invoice_cookie = s(c.get("digigo_invoice_id")?.value || "");
    const back_cookie = s(c.get("digigo_back_url")?.value || "");

    const state = s(body.state) || state_cookie;
    const invoice_id = invoice_id_from_body || invoice_cookie;
    const back_url = s(body.back_url) || back_cookie || (invoice_id ? `/invoices/${invoice_id}` : "/");

    if (!token && !code) return NextResponse.json({ ok: false, error: "MISSING_TOKEN_OR_CODE" }, { status: 400 });
    if (!state) return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
    if (!invoice_id) return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });

    const sessRes = await svc
      .from("digigo_sign_sessions")
      .select("id,invoice_id,back_url,status,expires_at")
      .eq("state", state)
      .maybeSingle();

    if (sessRes.error) {
      return NextResponse.json({ ok: false, error: "SESSION_LOOKUP_FAILED", details: sessRes.error.message }, { status: 500 });
    }
    if (!sessRes.data) {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const session = sessRes.data;
    const sessionBack = s(session.back_url) || back_url;

    const sigRes = await svc
      .from("invoice_signatures")
      .select("id,provider,state,unsigned_hash,unsigned_xml,signed_xml,signed_at,meta")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    if (sigRes.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_LOOKUP_FAILED", details: sigRes.error.message }, { status: 500 });
    }
    if (!sigRes.data) {
      await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: "NO_SIGNATURE_ROW", updated_at: nowIso() }).eq("id", session.id);
      return NextResponse.json({ ok: false, error: "NO_SIGNATURE_ROW" }, { status: 404 });
    }

    const sig = sigRes.data as any;
    const unsigned_hash = s(sig.unsigned_hash);
    if (!unsigned_hash) {
      await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: "MISSING_UNSIGNED_HASH", updated_at: nowIso() }).eq("id", session.id);
      return NextResponse.json({ ok: false, error: "MISSING_UNSIGNED_HASH" }, { status: 400 });
    }

    const verified = token ? await digigoVerifyToken(token).catch(() => null) : null;

    const signedXml = await digigoFetchSignedXml({
      token,
      code,
      state,
      hashBase64: unsigned_hash,
      verifiedToken: verified,
    });

    if (!signedXml) {
      await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: "SIGNED_XML_EMPTY", updated_at: nowIso() }).eq("id", session.id);
      await svc.from("invoice_signatures").update({ state: "failed", error_message: "SIGNED_XML_EMPTY", updated_at: nowIso() }).eq("id", sig.id);
      await svc.from("invoices").update({ signature_status: "failed", updated_at: nowIso() }).eq("id", invoice_id);

      return NextResponse.json({ ok: true, redirect: `${sessionBack}?sig=failed` }, { status: 200 });
    }

    const upSig = await svc
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_xml: signedXml,
        signed_at: nowIso(),
        error_message: null,
        updated_at: nowIso(),
      })
      .eq("id", sig.id);

    if (upSig.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPDATE_FAILED", details: upSig.error.message }, { status: 500 });
    }

    await svc.from("digigo_sign_sessions").update({ status: "done", error_message: null, updated_at: nowIso() }).eq("id", session.id);
    await svc.from("invoices").update({ signature_status: "signed", ttn_signed: true, signed_at: nowIso(), updated_at: nowIso() }).eq("id", invoice_id);

    return NextResponse.json({ ok: true, redirect: sessionBack }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "CALLBACK_FATAL", details: s(e?.message || e) }, { status: 500 });
  }
}
