import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildTeifInvoiceXml } from "@/lib/ttn/teifXml";
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function clampPct(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function isHttps(req: Request) {
  const proto = s(req.headers.get("x-forwarded-proto") || "");
  if (proto) return proto === "https";
  const app = s(process.env.NEXT_PUBLIC_APP_URL || "");
  return app.startsWith("https://");
}

function pickCredentialId(cred: any) {
  const sc = cred?.signature_config && typeof cred.signature_config === "object" ? cred.signature_config : null;
  const fromConfig =
    s(sc?.digigo_signer_email) ||
    s(sc?.credentialId) ||
    s(sc?.credential_id) ||
    s(sc?.email) ||
    s(sc?.signer_email);
  return fromConfig || s(cred?.signer_email) || s(cred?.cert_email);
}

function computeFromItems(items: any[]) {
  let ht = 0;
  let tva = 0;
  for (const it of items) {
    const qty = n(it.quantity ?? 0);
    const pu = n(it.unit_price_ht ?? 0);
    const vatPct = n(it.vat_pct ?? 0);
    const discPct = clampPct(n(it.discount_pct ?? 0));
    const base = qty * pu;
    const remise = discPct > 0 ? (base * discPct) / 100 : 0;
    const net = base - remise;
    const vat = (net * vatPct) / 100;
    ht += net;
    tva += vat;
  }
  return { ht, tva, ttc: ht + tva };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoiceId = s(body.invoiceId ?? body.invoice_id ?? body.id);
  const backUrl = s(body.backUrl ?? body.back_url);

  if (!invoiceId || !isUuid(invoiceId)) {
    return NextResponse.json({ ok: false, error: "BAD_INVOICE_ID" }, { status: 400 });
  }

  const svc = createServiceClient();

  const invRes = await svc.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (!invRes.data) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
  const invoice: any = invRes.data;

  const compRes = await svc.from("companies").select("*").eq("id", invoice.company_id).maybeSingle();
  if (!compRes.data) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const credRes = await svc
    .from("ttn_credentials")
    .select("company_id, environment, is_active, signer_email, cert_email, signature_config, updated_at")
    .eq("company_id", invoice.company_id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cred = credRes.data;
  if (!cred) return NextResponse.json({ ok: false, error: "CREDENTIAL_NOT_FOUND" }, { status: 400 });

  const credentialId = pickCredentialId(cred);
  if (!credentialId) return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });

  const itemsRes = await svc
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  const items = itemsRes.data || [];
  const totals = computeFromItems(items);

  const stampEnabled = !!invoice.stamp_enabled;
  const stampAmount = stampEnabled ? n(invoice.stamp_amount ?? 0) : 0;
  const total_ttc = totals.ttc + stampAmount;

  const unsigned_xml = buildTeifInvoiceXml({
    invoice: {
      ...invoice,
      subtotal_ht: totals.ht,
      total_vat: totals.tva,
      total_ttc,
      company: compRes.data,
      stamp_enabled: stampEnabled,
      stamp_amount: stampAmount,
    },
    items,
    ttn: { settings: { stampEnabled, stampAmount } } as any,
  } as any);

  const unsigned_hash = sha256Base64Utf8(unsigned_xml);

  const state = crypto.randomUUID();
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const backUrlFinal = backUrl || `/invoices/${invoiceId}`;
  const env = s(cred.environment || process.env.DIGIGO_ENV || process.env.NODE_ENV || "production");

  const sessIns = await svc
    .from("digigo_sign_sessions")
    .insert({
      state,
      invoice_id: invoiceId,
      company_id: invoice.company_id,
      created_by: auth.user.id,
      back_url: backUrlFinal,
      status: "pending",
      expires_at,
      environment: env,
    })
    .select("id")
    .maybeSingle();

  if (sessIns.error) {
    return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", details: sessIns.error.message }, { status: 500 });
  }

  const up = await svc.from("invoice_signatures").upsert(
    {
      invoice_id: invoiceId,
      company_id: invoice.company_id,
      environment: env,
      provider: "digigo",
      state: "pending",
      unsigned_xml,
      unsigned_hash,
      signed_xml: null,
      signed_at: null,
      error_message: null,
      signer_user_id: auth.user.id,
      meta: { credentialId, state, environment: env },
    } as any,
    { onConflict: "invoice_id,provider" } as any
  );

  if (up.error) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED", details: up.error.message }, { status: 500 });
  }

  const authorize_url = digigoAuthorizeUrl({
    credentialId,
    hashBase64: unsigned_hash,
    numSignatures: 1,
    state,
  });

  const res = NextResponse.json({ ok: true, authorize_url, state, invoiceId }, { status: 200 });

  const secure = isHttps(req);
  const maxAge = 60 * 30;

  res.cookies.set("digigo_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  res.cookies.set("digigo_invoice_id", invoiceId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  res.cookies.set("digigo_back_url", backUrlFinal, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });

  return res;
}
