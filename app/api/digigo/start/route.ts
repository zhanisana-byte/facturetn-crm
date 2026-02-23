import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/digigo/supabaseAdmin";
import { s, uuid } from "@/lib/digigo/ids";

export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any));

  const invoice_id = s(body?.invoice_id || body?.invoiceId);
  if (!invoice_id || !isUuid(invoice_id)) return NextResponse.json({ error: "BAD_INVOICE_ID" }, { status: 400 });

  const admin = supabaseAdmin();

  const inv = await admin.from("invoices").select("id, company_id").eq("id", invoice_id).maybeSingle();
  if (!inv.data) return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const company_id = s((inv.data as any)?.company_id);
  if (!company_id || !isUuid(company_id)) return NextResponse.json({ error: "BAD_COMPANY_ID" }, { status: 400 });

  const back_url = s(body?.back_url || body?.backUrl) || `/invoices/${invoice_id}`;

  const cs = await admin.from("company_settings").select("*").eq("company_id", company_id).maybeSingle();
  const digigo_signer_email = s((cs.data as any)?.digigo_signer_email);

  const cred = await admin
    .from("ttn_credentials")
    .select("*")
    .eq("company_id", company_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const signature_config = (cred.data as any)?.signature_config;
  const cfgEmail =
    signature_config && typeof signature_config === "object" ? s((signature_config as any)?.digigo_signer_email) : "";

  const cert_email = s((cred.data as any)?.cert_email);

  const credentialId = digigo_signer_email || cfgEmail || cert_email || s(body?.credentialId);
  if (!credentialId) return NextResponse.json({ error: "MISSING_CREDENTIAL_ID" }, { status: 400 });

  const hash = s(body?.hash);
  if (!hash) return NextResponse.json({ error: "MISSING_HASH" }, { status: 400 });

  const clientId = s(process.env.DIGIGO_CLIENT_ID);
  const base = s(process.env.DIGIGO_BASE_URL).replace(/\/$/, "");
  const redirectUri = s(process.env.DIGIGO_REDIRECT_URI);
  if (!clientId || !base || !redirectUri) return NextResponse.json({ error: "DIGIGO_ENV_MISSING" }, { status: 500 });

  const numSignatures = s(body?.numSignatures || 1);
  const scope = s(body?.scope || "credential");

  const state = uuid();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

  const { error } = await admin.from("digigo_sign_sessions").insert({
    invoice_id,
    company_id,
    state,
    back_url,
    status: "pending",
    digigo_jti: null,
    error_message: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    environment: "production",
  });

  if (error) {
    return NextResponse.json({ error: "SESSION_CREATE_FAILED", details: error.message }, { status: 500 });
  }

  const authorizeUrl =
    `${base}/tunsign-proxy-webapp/oauth2/authorize` +
    `?redirectUri=${encodeURIComponent(redirectUri)}` +
    `&responseType=code` +
    `&scope=${encodeURIComponent(scope)}` +
    `&credentialId=${encodeURIComponent(credentialId)}` +
    `&clientId=${encodeURIComponent(clientId)}` +
    `&numSignatures=${encodeURIComponent(String(numSignatures))}` +
    `&hash=${encodeURIComponent(hash)}` +
    `&state=${encodeURIComponent(state)}`;

  return NextResponse.json({ authorizeUrl, invoice_id, back_url, state });
}
