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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}
function isHttps(req: Request) {
  const proto = s(req.headers.get("x-forwarded-proto") || "");
  if (proto) return proto === "https";
  const app = s(process.env.NEXT_PUBLIC_APP_URL || "");
  return app.startsWith("https://");
}
function env(name: string, fallback = "") {
  return s(process.env[name] ?? fallback);
}

function computeFromItems(items: any[]) {
  let ht = 0;
  let tva = 0;

  for (const it of items) {
    const qty = n(it?.qty);
    const pu = n(it?.unit_price_ht);
    const discountPct = clampPct(n(it?.discount_pct));
    const rate = clampPct(n(it?.vat_rate));

    const lineBase = qty * pu;
    const lineDisc = lineBase * (discountPct / 100);
    const lineNet = lineBase - lineDisc;

    ht += lineNet;
    tva += lineNet * (rate / 100);
  }

  return { ht, tva };
}

export async function POST(req: Request) {
  const auth = await createClient();
  const userRes = await auth.auth.getUser();
  const user = userRes.data?.user;

  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body.invoice_id ?? body.invoiceId);
  const back_url = s(body.back_url ?? body.backUrl);

  if (!invoice_id || !isUuid(invoice_id)) {
    return NextResponse.json({ ok: false, error: "BAD_INVOICE_ID" }, { status: 400 });
  }

  const svc = createServiceClient();

  const invRes = await svc.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
  if (!invRes.data) {
    return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
  }
  const invoice: any = invRes.data;

  const company_id = s(invoice.company_id);
  if (!company_id || !isUuid(company_id)) {
    return NextResponse.json({ ok: false, error: "BAD_COMPANY_ID" }, { status: 400 });
  }

  const allowed = await canCompanyAction(auth, user.id, company_id, "validate_invoices");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const companyRes = await svc.from("companies").select("*").eq("id", company_id).maybeSingle();
  if (!companyRes.data) {
    return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
  }
  const company: any = companyRes.data;

  const itemsRes = await svc
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoice_id)
    .order("created_at", { ascending: true });

  const items: any[] = itemsRes.data || [];

  const sums = computeFromItems(items);

  const stampAmount = n(invoice?.stamp_amount ?? invoice?.stamp_duty_amount ?? invoice?.timbre ?? 0);
  const stampEnabled =
    Boolean(invoice?.stamp_enabled ?? invoice?.stampEnabled ?? invoice?.stamp_duty ?? false) ||
    stampAmount > 0;

  const ttc = sums.ht + sums.tva + (stampEnabled ? stampAmount : 0);

  const xml = buildTeifInvoiceXml({
    invoiceId: invoice_id,
    invoice,
    company,
    items,
    totals: {
      ht: sums.ht,
      tva: sums.tva,
      ttc,
      stampEnabled,
      stampAmount: stampEnabled ? stampAmount : 0,
    },
  });

  const unsigned_hash = sha256Base64Utf8(xml);
  const state = crypto.randomUUID();

  const credentialId =
    s(company?.digigo_credential_id) ||
    s(company?.digigo_credentialId) ||
    env("DIGIGO_CREDENTIAL_ID") ||
    env("NEXT_PUBLIC_DIGIGO_CREDENTIAL_ID");

  if (!credentialId) {
    return NextResponse.json({ ok: false, error: "MISSING_CREDENTIAL_ID" }, { status: 400 });
  }

  const backUrlFinal = back_url || `/invoices/${invoice_id}`;
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 60 * 1000);

  const up = await svc.from("digigo_sign_sessions").insert({
    invoice_id,
    state,
    back_url: backUrlFinal,
    status: "PENDING",
    created_by: user.id,
    expires_at: expires.toISOString(),
    company_id,
    environment: s(process.env.DIGIGO_ENV || process.env.NEXT_PUBLIC_DIGIGO_ENV || "test"),
  });

  if (up.error) {
    return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED" }, { status: 500 });
  }

  const sigUp = await svc.from("invoice_signatures").upsert(
    {
      invoice_id,
      company_id,
      unsigned_xml: xml,
      unsigned_hash,
      provider: "DIGIGO",
      status: "PENDING",
    },
    { onConflict: "invoice_id" }
  );

  if (sigUp.error) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED" }, { status: 500 });
  }

  const authorize_url = digigoAuthorizeUrl({
    credentialId,
    hashBase64: unsigned_hash,
    numSignatures: 1,
    state,
  });

  const res = NextResponse.json(
    { ok: true, authorize_url, state, invoice_id, back_url: backUrlFinal },
    { status: 200 }
  );

  const secure = isHttps(req);
  const maxAge = 60 * 30;

  res.cookies.set("digigo_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  res.cookies.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
  res.cookies.set("digigo_back_url", backUrlFinal, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });

  return res;
}
