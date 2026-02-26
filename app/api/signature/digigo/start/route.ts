import { NextResponse } from "next/server";
import crypto from "crypto";
import { digigoAuthorizeUrl, sha256Base64Utf8, type DigigoEnv } from "@/lib/digigo/client";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();

    const body = await req.json().catch(() => ({}));
    const invoiceId = s(body.invoice_id || body.invoiceId);
    const backUrl = s(body.back_url || body.backUrl);

    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const invRes = await service
      .from("invoices")
      .select("id, company_id")
      .eq("id", invoiceId)
      .single();

    if (!invRes.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const companyId = s(invRes.data.company_id);

    const compRes = await service
      .from("companies")
      .select("id, digigo_credential_id")
      .eq("id", companyId)
      .single();

    if (!compRes.data) {
      return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const credentialId = s(compRes.data.digigo_credential_id);
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const env = (s(process.env.DIGIGO_ENV) === "production" ? "production" : "test") as DigigoEnv;
    const clientId = s(process.env.DIGIGO_CLIENT_ID);
    const redirectUri = s(process.env.DIGIGO_REDIRECT_URI);

    if (!clientId || !redirectUri) {
      return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_ENV" }, { status: 500 });
    }

    const state = crypto.randomUUID();

    const hash = sha256Base64Utf8(invoiceId);

    await service.from("digigo_sign_sessions").insert({
      invoice_id: invoiceId,
      company_id: companyId,
      state,
      back_url: backUrl || `/invoices/${invoiceId}`,
      status: "pending",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      environment: env,
    });

    const authorize_url = digigoAuthorizeUrl({
      env,
      clientId,
      redirectUri,
      state,
      credentialId,
      hashBase64: hash,
      numSignatures: 1,
    });

    return NextResponse.json({ ok: true, authorize_url, state });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: s(e?.message) }, { status: 500 });
  }
}
