import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoOauthToken, digigoSignHash, jwtGetJti } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ""));
}

async function readJsonOrText(res: Response) {
  const txt = await res.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }
  return { j, txt };
}

export async function POST(req: Request) {
  const service = createServiceClient();
  const cookieStore = await cookies();

  let step = "init";
  let session: any = null;

  try {
    step = "read_body";
    const body = await req.json().catch(() => ({}));

    const token = s(body?.token);
    const codeParam = s(body?.code);
    const state = s(body?.state || cookieStore.get("digigo_state")?.value);
    let invoice_id = s(body?.invoice_id || cookieStore.get("digigo_invoice_id")?.value);
    const back_url = s(body?.back_url || cookieStore.get("digigo_back_url")?.value || "/app");

    const jti = token ? s(jwtGetJti(token)) : "";
    const code = codeParam || jti;

    if (!code) {
      return NextResponse.json({ ok: false, error: "CODE_MISSING" }, { status: 400 });
    }

    if ((!invoice_id || !isUuid(invoice_id)) && state) {
      const ss = await service
        .from("digigo_sign_sessions")
        .select("invoice_id")
        .eq("state", state)
        .maybeSingle();

      if (ss.data?.invoice_id) invoice_id = s(ss.data.invoice_id);
    }

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
    }

    step = "get_signature_context";

    const sigRes = await service
      .from("invoice_signatures")
      .select("company_id, environment, unsigned_xml, unsigned_hash, meta")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    if (!sigRes.data) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_CONTEXT_NOT_FOUND" }, { status: 404 });
    }

    const sig: any = sigRes.data;

    const company_id = s(sig.company_id);
    const unsigned_xml = s(sig.unsigned_xml);
    const unsigned_hash = s(sig.unsigned_hash);
    const environment = s(sig.environment || "test");

    if (!company_id || !unsigned_xml || !unsigned_hash) {
      return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE_CONTEXT" }, { status: 400 });
    }

    step = "resolve_credentials";

    const credRes = await service
      .from("ttn_credentials")
      .select("signature_config, digigo_token")
      .eq("company_id", company_id)
      .eq("environment", environment)
      .maybeSingle();

    const cfg = (credRes.data?.signature_config as any) || {};
    const credentialId = s(cfg.digigo_signer_email || cfg.credentialId || "");

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

    step = "oauth2_token";
    const oauth = await digigoOauthToken({ code });

    if (!oauth.ok) {
      return NextResponse.json({ ok: false, error: oauth.error, details: { step } }, { status: 400 });
    }

    const access_token = s((oauth as any)?.access_token || (oauth as any)?.token || "");
    const sad = s((oauth as any)?.sad || "");

    if (!access_token || !sad) {
      return NextResponse.json({ ok: false, error: "OAUTH_TOKEN_INVALID", details: { step } }, { status: 400 });
    }

    step = "sign_hash";
    const sign = await digigoSignHash({
      token: access_token,
      credentialId,
      sad,
      hashes: [unsigned_hash],
    });

    if (!sign.ok) {
      return NextResponse.json({ ok: false, error: sign.error, details: { step } }, { status: 400 });
    }

    const signatureValue = s((sign as any)?.value || "");
    if (!signatureValue) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_EMPTY", details: { step } }, { status: 400 });
    }

    step = "persist";
    await service
      .from("invoice_signatures")
      .update({
        signed_xml: unsigned_xml,
        signed_hash: unsigned_hash,
        signature_value: signatureValue,
        state: "signed",
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoice_id);

    await service
      .from("invoices")
      .update({ signature_status: "signed", updated_at: new Date().toISOString() })
      .eq("id", invoice_id);

    if (state) {
      await service
        .from("digigo_sign_sessions")
        .update({ status: "signed", updated_at: new Date().toISOString() })
        .eq("state", state);
    }

    return NextResponse.json({ ok: true, invoice_id, redirect: back_url });
  } catch (e: any) {
    const msg = s(e?.message || "INTERNAL_ERROR");
    if (state) {
      await service
        .from("digigo_sign_sessions")
        .update({ status: "failed", error_message: `${step}:${msg}`, updated_at: new Date().toISOString() })
        .eq("state", state);
    }
    return NextResponse.json({ ok: false, error: msg, details: { step } }, { status: 500 });
  }
}
