import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { digigoAuthorizeUrl, randomState, type DigigoEnv } from "@/lib/digigo/client";

function clean(v?: string | null) {
  const x = (v ?? "").trim();
  return x.length ? x : null;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const invoiceId = clean(body?.invoice_id);
  const backUrl = clean(body?.back_url);
  const env = (clean(body?.environment) as DigigoEnv) || "test";

  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, company_id")
    .eq("id", invoiceId)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
  }

  const { data: company, error: compErr } = await supabase
    .from("companies")
    .select("id, digigo_credential_id")
    .eq("id", invoice.company_id)
    .single();

  if (compErr || !company) {
    return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
  }

  let credentialId = clean(company.digigo_credential_id);

  if (!credentialId) {
    const { data: ttnCred, error: ttnErr } = await supabase
      .from("ttn_credentials")
      .select("signature_config")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!ttnErr && ttnCred?.signature_config) {
      const cfg = ttnCred.signature_config as any;
      credentialId = clean(cfg?.credentialId);
    }
  }

  if (!credentialId) {
    return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_CREDENTIAL_ID" }, { status: 400 });
  }

  const clientId = clean(process.env.DIGIGO_CLIENT_ID);
  const redirectUri = clean(process.env.DIGIGO_REDIRECT_URI);

  if (!clientId || !redirectUri) {
    return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_ENV" }, { status: 500 });
  }

  const state = randomState();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: sessErr } = await supabase.from("digigo_sign_sessions").insert({
    invoice_id: invoiceId,
    company_id: company.id,
    state,
    back_url: backUrl,
    status: "pending",
    created_by: user.id,
    expires_at: expiresAt,
    environment: env,
  });

  if (sessErr) {
    return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", details: sessErr.message }, { status: 500 });
  }

  const url = digigoAuthorizeUrl({
    env,
    clientId,
    redirectUri,
    state,
    credentialId,
  });

  return NextResponse.json({ ok: true, url, state });
}
