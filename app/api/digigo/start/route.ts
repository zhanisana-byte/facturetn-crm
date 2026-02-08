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
    const lineHt = Math.max(0, base - remise);

    ht += lineHt;
    tva += (lineHt * vatPct) / 100;
  }

  return { ht, tva, ttc: ht + tva };
}

async function canSignInvoice(supabase: any, userId: string, companyId: string) {
  if (await canCompanyAction(supabase, userId, companyId, "validate_invoices")) return true;
  if (await canCompanyAction(supabase, userId, companyId, "submit_ttn")) return true;
  if (await canCompanyAction(supabase, userId, companyId, "create_invoices")) return true;
  return false;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const invoice_id = s(body.invoice_id);
    const back_url = s(body.back_url);

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const invRes = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (!invRes.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }
    const invoice = invRes.data;

    if (!(await canSignInvoice(supabase, auth.user.id, invoice.company_id))) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const compRes = await service.from("companies").select("*").eq("id", invoice.company_id).single();
    if (!compRes.data) {
      return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    }
    const company = compRes.data;

    const credRes = await service
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", invoice.company_id)
      .eq("is_active", true)
      .maybeSingle();

    const credentialId = s(credRes.data?.signature_config?.credentialId);
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const itemsRes = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("line_no");

    const items = itemsRes.data ?? [];
    const totals = computeFromItems(items);

    const stamp_enabled = Boolean(invoice.stamp_enabled);
    const stamp_amount = n(invoice.stamp_amount);

    const unsigned_xml = buildTeifInvoiceXml({
      invoice,
      company,
      items,
      totals: {
        ht: totals.ht,
        tva: totals.tva,
        ttc: totals.ttc,
        stampEnabled: stamp_enabled,
        stampAmount: stamp_amount,
      },
    } as any);

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);
    const state = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const sess = await service.from("digigo_sign_sessions").insert({
      state,
      invoice_id,
      company_id: invoice.company_id,
      created_by: auth.user.id,
      back_url: back_url || `/invoices/${invoice_id}`,
      expires_at,
    });

    if (sess.error) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", message: s(sess.error.message) }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: unsigned_hash,
      numSignatures: 1,
      state,
    });

    const up = await service.from("invoice_signatures").upsert({
      invoice_id,
      provider: "digigo",
      state: "pending",
      unsigned_xml,
      unsigned_hash,
      signer_user_id: auth.user.id,
      meta: { credentialId, state },
    });

    if (up.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED", message: s(up.error.message) }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        authorize_url,
        state,
        invoice_number: s(invoice.invoice_number),
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "SERVER_ERROR", message: s(e?.message) }, { status: 500 });
  }
}
