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
    const qty = n(it.quantity ?? it.qty ?? 0);
    const pu = n(it.unit_price_ht ?? it.unit_price ?? it.price ?? 0);
    const vatPct = n(it.vat_pct ?? it.vatPct ?? it.tva_pct ?? it.tvaPct ?? it.vat ?? 0);

    const discPct = clampPct(
      n(it.discount_pct ?? it.discountPct ?? it.remise_pct ?? it.remisePct ?? it.discount ?? 0)
    );
    const discAmt = n(it.discount_amount ?? it.discountAmount ?? it.remise_amount ?? it.remiseAmount ?? 0);

    const base = qty * pu;
    const remise = discAmt > 0 ? discAmt : discPct > 0 ? (base * discPct) / 100 : 0;
    const lineHt = Math.max(0, base - remise);

    ht += lineHt;
    tva += (lineHt * vatPct) / 100;
  }

  const ttc = ht + tva;
  return { ht, tva, ttc };
}

function friendlyTeifError(msg: string) {
  const m = s(msg);
  if (!m) return "Erreur TEIF.";
  const low = m.toLowerCase();
  if (low.includes("max size")) return "TEIF trop volumineux.";
  if (low.includes("minimum") || low.includes("required") || low.includes("oblig")) {
    return "TEIF incomplet (champs obligatoires manquants).";
  }
  return m;
}

async function canSignInvoice(supabase: any, userId: string, companyId: string) {
  const a = await canCompanyAction(supabase, userId, companyId, "validate_invoices");
  if (a) return true;
  const b = await canCompanyAction(supabase, userId, companyId, "submit_ttn");
  if (b) return true;
  const c = await canCompanyAction(supabase, userId, companyId, "create_invoices");
  if (c) return true;
  return false;
}

function expiresDatePlusDays(days: number) {
  const ms = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id || body.invoiceId);
    const backUrl = s(body.back_url || body.backUrl || "");

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const invRes = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (invRes.error || !invRes.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }
    const invoice: any = invRes.data;

    if (!s(invoice.invoice_number)) {
      return NextResponse.json({ ok: false, error: "INVOICE_NUMBER_MISSING" }, { status: 400 });
    }

    const company_id = s(invoice.company_id);
    if (!company_id || !isUuid(company_id)) {
      return NextResponse.json({ ok: false, error: "COMPANY_ID_MISSING" }, { status: 400 });
    }

    const allowed = await canSignInvoice(supabase, auth.user.id, company_id);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const compRes = await service.from("companies").select("*").eq("id", company_id).single();
    if (compRes.error || !compRes.data) {
      return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const credRes = await service
      .from("ttn_credentials")
      .select("id,environment,signature_provider,signature_config,is_active,company_id")
      .eq("company_id", company_id)
      .eq("is_active", true)
      .maybeSingle();

    if (credRes.error) {
      return NextResponse.json(
        { ok: false, error: "TTN_CREDENTIALS_READ_FAILED", message: credRes.error.message },
        { status: 500 }
      );
    }
    if (!credRes.data) {
      return NextResponse.json({ ok: false, error: "TTN_CREDENTIALS_MISSING" }, { status: 400 });
    }

    const cred: any = credRes.data;
    const signature_config: any = cred.signature_config ?? {};
    const configured = !!signature_config?.digigo_configured;
    const signer_email = s(signature_config?.digigo_signer_email);

    if (!configured || !signer_email) {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const itemsRes = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("position", { ascending: true });

    if (itemsRes.error) {
      return NextResponse.json({ ok: false, error: "ITEMS_READ_FAILED", message: itemsRes.error.message }, { status: 500 });
    }

    const items = itemsRes.data ?? [];
    const computed = computeFromItems(items);

    const ht = n(invoice.total_ht ?? computed.ht);
    const tva = n(invoice.total_tva ?? computed.tva);
    const ttc = n(invoice.total_ttc ?? computed.ttc);

    const stampEnabled = Boolean(invoice.stamp_enabled ?? invoice.stampEnabled ?? false);
    const stampAmount = n(invoice.stamp_amount ?? invoice.stampAmount ?? 0);

    let xmlBuild: any;
    try {
      xmlBuild = await buildTeifInvoiceXml({
        invoice,
        company: compRes.data,
        items,
        totals: {
          ht,
          tva,
          ttc,
          stampEnabled,
          stampAmount,
        },
      });
    } catch (e: any) {
      xmlBuild = { ok: false, error: s(e?.message || e) };
    }

    if (!xmlBuild?.ok) {
      return NextResponse.json(
        { ok: false, error: "TEIF_BUILD_FAILED", message: friendlyTeifError(s(xmlBuild?.error)) },
        { status: 400 }
      );
    }

    const unsigned_xml = s(xmlBuild.xml);
    if (!unsigned_xml) {
      return NextResponse.json({ ok: false, error: "TEIF_EMPTY" }, { status: 400 });
    }

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);
    if (!unsigned_hash) {
      return NextResponse.json({ ok: false, error: "HASH_FAILED" }, { status: 500 });
    }

    const state = `${invoice_id}:${crypto.randomUUID()}`;
    const expiresAt = expiresDatePlusDays(2);

    await service
      .from("digigo_sign_sessions")
      .update({ status: "revoked" })
      .eq("invoice_id", invoice_id)
      .eq("status", "pending");

    const sessIns = await service
      .from("digigo_sign_sessions")
      .insert({
        state,
        invoice_id,
        company_id,
        created_by: auth.user.id,
        back_url: backUrl || `/invoices/${invoice_id}`,
        expires_at: expiresAt,
        status: "pending",
      })
      .select("id")
      .single();

    if (sessIns.error) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", message: sessIns.error.message }, { status: 500 });
    }

    let authorize_url = "";
    try {
      authorize_url = digigoAuthorizeUrl({
        signerEmail: signer_email,
        state,
        documentHash: unsigned_hash,
      });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: "AUTHORIZE_URL_FAILED", message: s(e?.message || e) }, { status: 500 });
    }

    await service
      .from("invoices")
      .update({
        signature_status: "pending",
        signature_provider: "digigo",
        unsigned_xml,
        unsigned_hash,
        signer_email,
      })
      .eq("id", invoice_id);

    return NextResponse.json({ ok: true, state, authorize_url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "SERVER_CRASH", message: "Erreur serveur (digigo start).", details: s(e?.message || e) },
      { status: 500 }
    );
  }
}
