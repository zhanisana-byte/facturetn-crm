import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import { buildTeifInvoiceXml } from "@/lib/ttn/teifXml";
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo/client";

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

function computeFromItems(items: any[]) {
  let ht = 0;
  let tva = 0;
  for (const it of items) {
    const qty = n(it.quantity ?? it.qty ?? 0);
    const pu = n(it.unit_price_ht ?? it.pu_ht ?? 0);
    const vatPct = n(it.vat_pct ?? it.vat_rate ?? it.tva ?? 0);
    const discPct = clampPct(n(it.discount_pct ?? it.remise ?? 0));

    const base = qty * pu;
    const remise = discPct > 0 ? (base * discPct) / 100 : 0;
    const net = base - remise;

    ht += net;
    tva += (net * vatPct) / 100;
  }
  return { ht, tva };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body.invoice_id ?? body.invoiceId);
  const back_url = s(body.back_url ?? body.backUrl);

  if (!invoice_id || !isUuid(invoice_id)) {
    return NextResponse.json({ ok: false, error: "BAD_INVOICE_ID" }, { status: 400 });
  }

  const svc = createServiceClient();

  const invRes = await svc.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
  if (!invRes.data) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const invoice: any = invRes.data;
  const company_id = s(invoice.company_id);

  if (!company_id || !isUuid(company_id)) {
    return NextResponse.json({ ok: false, error: "BAD_COMPANY_ID" }, { status: 400 });
  }

  const allowed = await canCompanyAction(supabase, user.id, company_id, "create_invoices" as any);
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const compRes = await svc.from("companies").select("*").eq("id", company_id).maybeSingle();
  if (!compRes.data) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const company: any = compRes.data;

  const credRes = await svc
    .from("ttn_credentials")
    .select("signature_config, updated_at")
    .eq("company_id", company_id)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  const cred = credRes.data?.[0];
  const signatureConfig: any = cred?.signature_config || {};
  const credentialId = s(signatureConfig.digigo_signer_email ?? signatureConfig.credentialId ?? signatureConfig.email ?? "");

  if (!credentialId) {
    return NextResponse.json({ ok: false, error: "MISSING_CREDENTIAL_ID" }, { status: 400 });
  }

  const itemsRes = await svc
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoice_id)
    .order("line_no", { ascending: true });

  const items: any[] = itemsRes.data || [];
  const sums = computeFromItems(items);

  const stampEnabled = Boolean(invoice?.stamp_enabled ?? invoice?.stampEnabled ?? invoice?.stamp_duty ?? false);
  const stampAmount = stampEnabled ? n(invoice?.stamp_amount ?? invoice?.stampAmount ?? 0) : 0;

  const ttc = sums.ht + sums.tva + stampAmount;

  const unsigned_xml = buildTeifInvoiceXml({
    invoiceId: invoice_id,
    invoice,
    company,
    items,
    totals: {
      ht: sums.ht,
      tva: sums.tva,
      ttc,
      stampEnabled,
      stampAmount,
    },
  } as any);

  const unsigned_hash = sha256Base64Utf8(unsigned_xml);
  const state = crypto.randomUUID();

  const backUrlFinal = back_url || `/invoices/${invoice_id}`;
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const env = s(process.env.DIGIGO_ENV || process.env.NEXT_PUBLIC_DIGIGO_ENV || process.env.NODE_ENV || "production");

  const sessIns = await svc
    .from("digigo_sign_sessions")
    .insert({
      state,
      invoice_id,
      company_id,
      created_by: user.id,
      back_url: backUrlFinal,
      status: "pending",
      expires_at,
      environment: env,
    })
    .select("id")
    .maybeSingle();

  if (sessIns.error) {
    return NextResponse.json(
      { ok: false, error: "SESSION_CREATE_FAILED", details: sessIns.error.message },
      { status: 500 }
    );
  }

  const sigPayload = {
    invoice_id,
    company_id,
    environment: env,
    provider: "digigo",
    state: "pending",
    unsigned_xml,
    unsigned_hash,
    signer_user_id: user.id,
    meta: { credentialId, state, back_url: backUrlFinal },
  };

  const up = await svc.from("invoice_signatures").upsert(sigPayload, { onConflict: "invoice_id" });

  if (up.error) {
    return NextResponse.json(
      { ok: false, error: "SIGNATURE_UPSERT_FAILED", details: up.error.message },
      { status: 500 }
    );
  }

  const authorize_url = digigoAuthorizeUrl({
    credentialId,
    hashBase64: unsigned_hash,
    numSignatures: 1,
    state,
  });

  const res = NextResponse.json({ ok: true, authorize_url, state, invoice_id, back_url: backUrlFinal }, { status: 200 });

  const secure = isHttps(req);
  const maxAge = 60 * 30;

  res.cookies.set("digigo_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  res.cookies.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  res.cookies.set("digigo_back_url", backUrlFinal, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });

  return res;
}
