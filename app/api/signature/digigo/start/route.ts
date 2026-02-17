import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { digigoAuthorizeUrl, DigigoEnv, sha256Base64Utf8 } from "@/lib/digigo/server";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(req: Request) {
  try {
    const { invoice_id, back_url } = await req.json();

    if (!invoice_id) {
      return NextResponse.json({ error: "MISSING_INVOICE_ID" }, { status: 400 });
    }

    const { data: inv, error: invErr } = await sb
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invErr || !inv) {
      return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const companyId = inv.company_id;
    if (!companyId) {
      return NextResponse.json({ error: "MISSING_COMPANY_ID" }, { status: 400 });
    }

    const { data: creds, error: credErr } = await sb
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credErr || !creds) {
      return NextResponse.json({ error: "TTN_CREDENTIALS_NOT_FOUND" }, { status: 400 });
    }

    const credentialId =
      (creds as any).credential_from_db ||
      (creds as any).credential_id ||
      (creds as any).credential ||
      (creds as any).credentialId;

    if (!credentialId) {
      return NextResponse.json({ error: "MISSING_CREDENTIAL_ID" }, { status: 400 });
    }

    const environmentDb =
      String((creds as any).environment || "production").toLowerCase() === "production"
        ? "PROD"
        : "TEST";

    const environment = environmentDb as DigigoEnv;

    const { data: sigRow, error: sigReadErr } = await sb
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoice_id)
      .eq("provider", "digigo")
      .eq("environment", environment === "PROD" ? "production" : "test")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sigReadErr) {
      return NextResponse.json({ error: "SIGNATURE_READ_ERROR" }, { status: 500 });
    }

    const unsignedXml = sigRow?.unsigned_xml;
    if (!unsignedXml) {
      return NextResponse.json({ error: "MISSING_UNSIGNED_XML" }, { status: 400 });
    }

    const hash = sha256Base64Utf8(unsignedXml);

    const state = crypto.randomUUID();

    const envText = environment === "PROD" ? "production" : "test";
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    const { error: sessErr } = await sb.from("digigo_sign_sessions").insert({
      invoice_id,
      company_id: companyId,
      environment: envText,
      state,
      status: "pending",
      back_url: back_url || `/invoices/${invoice_id}`,
      expires_at: expiresAt.toISOString(),
      created_by: (sigRow as any)?.signer_user_id || null,
    });

    if (sessErr) {
      return NextResponse.json({ error: "SESSION_INSERT_ERROR", details: String(sessErr.message || sessErr) }, { status: 500 });
    }

    const { error: sigUpErr } = await sb
      .from("invoice_signatures")
      .upsert(
        {
          invoice_id,
          company_id: companyId,
          environment: envText,
          provider: "digigo",
          state: "pending",
          unsigned_xml: unsignedXml,
          unsigned_hash: hash,
          meta: {
            state,
            environment: envText,
            credentialId,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "invoice_id,provider,environment" }
      );

    if (sigUpErr) {
      return NextResponse.json({ error: "SIGNATURE_UPSERT_ERROR", details: String(sigUpErr.message || sigUpErr) }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      hash,
      state,
      credentialId,
      environment,
      numSignatures: 1,
    });

    return NextResponse.json({
      ok: true,
      authorize_url,
      state,
      invoice_id,
      back_url: back_url || `/invoices/${invoice_id}`,
      hash,
      credentialId,
      environment: envText,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "INTERNAL_ERROR", details: String(e?.message || e) }, { status: 500 });
  }
}
