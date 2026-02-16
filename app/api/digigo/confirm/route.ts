import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import {
  jwtGetJti,
  digigoOauthToken,
  digigoSignHash,
} from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function sha256Base64Utf8(input: string) {
  return crypto
    .createHash("sha256")
    .update(String(input ?? ""), "utf8")
    .digest("base64");
}

function isUuid(v: string) {
  return /^[0-9a-f-]{36}$/i.test(v);
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
    const invoice_id = s(body?.invoice_id || cookieStore.get("digigo_invoice_id")?.value);
    const back_url = s(body?.back_url || cookieStore.get("digigo_back_url")?.value || "/app");

    const jti = token ? s(jwtGetJti(token)) : "";
    const code = codeParam || jti;

    if (!code) {
      return NextResponse.json({ ok: false, error: "CODE_MISSING" }, { status: 400 });
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
      return NextResponse.json(
        { ok: false, error: "INVALID_SIGNATURE_CONTEXT" },
        { status: 400 }
      );
    }

    step = "resolve_credentials";

    const credRes = await service
      .from("ttn_credentials")
      .select("signature_config, cert_email")
      .eq("company_id", company_id)
      .eq("environment", environment)
      .maybeSingle();

    if (!credRes.data) {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg = credRes.data.signature_config || {};
    const credentialId = s(
      cfg.digigo_signer_email ||
        cfg.credentialId ||
        credRes.data.cert_email
    );

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

    step = "oauth_token";

    const tok = await digigoOauthToken({ code });

    if (!tok.ok) {
      return NextResponse.json(
        { ok: false, error: "DIGIGO_TOKEN_FAILED", message: s((tok as any).error) },
        { status: 400 }
      );
    }

    const accessToken = s((tok as any).access_token);
    const sad = s((tok as any).sad);

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "ACCESS_TOKEN_MISSING" }, { status: 400 });
    }

    if (!sad) {
      return NextResponse.json({ ok: false, error: "SAD_MISSING" }, { status: 400 });
    }

    step = "sign_hash";

    const sign = await digigoSignHash({
      token: accessToken,
      credentialId,
      sad,
      hashes: [unsigned_hash],
    });

    if (!sign.ok) {
      return NextResponse.json(
        { ok: false, error: "DIGIGO_SIGNHASH_FAILED", message: s((sign as any).error) },
        { status: 400 }
      );
    }

    const signatureValue = s((sign as any).value);

    if (!signatureValue) {
      throw new Error("SIGNATURE_EMPTY");
    }

    step = "inject_signature";

    const signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signatureValue);
    const signed_hash = sha256Base64Utf8(signed_xml);

    step = "update_db";

    await service
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_xml,
        signed_hash,
        signed_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoice_id);

    await service
      .from("invoices")
      .update({
        signature_status: "signed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice_id);

    cookieStore.set("digigo_state", "", { path: "/", maxAge: 0 });
    cookieStore.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
    cookieStore.set("digigo_back_url", "", { path: "/", maxAge: 0 });

    return NextResponse.json({ ok: true, redirect: back_url });

  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        details: { step, message: s(e?.message) },
      },
      { status: 500 }
    );
  }
}
