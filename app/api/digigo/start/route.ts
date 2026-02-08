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

    const discPct = clampPct(n(it.discount_pct ?? it.discountPct ?? it.remise_pct ?? it.remisePct ?? it.discount ?? 0));
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

async function canSignInvoice(supabase: any, userId: string, companyId: string) {
  const a = await canCompanyAction(supabase, userId, companyId, "validate_invoices");
  if (a) return true;
  const b = await canCompanyAction(supabase, userId, companyId, "submit_ttn");
  if (b) return true;
  const c = await canCompanyAction(supabase, userId, companyId, "create_invoices");
  return c;
}

function scopeKey(resetScope: string) {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const rs = String(resetScope || "year").toLowerCase();
  if (rs === "month") return `${yyyy}-${mm}`;
  if (rs === "none") return `global`;
  return yyyy;
}

function pad(num: number, width: number) {
  const sNum = String(num);
  if (sNum.length >= width) return sNum;
  return "0".repeat(width - sNum.length) + sNum;
}

async function ensureInvoiceNumber(service: any, invoice: any) {
  const invNumber = s(invoice?.invoice_number);
  if (invNumber) return { invoice_number: invNumber, numbering_rule_id: s(invoice?.numbering_rule_id) || "" };

  const companyId = s(invoice?.company_id);
  if (!companyId) throw new Error("INVOICE_NO_COMPANY");

  const ruleRes = await service
    .from("invoice_numbering_rules")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();

  if (ruleRes.error) throw new Error(ruleRes.error.message);
  const rule = ruleRes.data;

  const prefix = s(rule?.prefix || "FV");
  const sep = s(rule?.separator || "-");
  const padding = Number(rule?.seq_padding ?? 6) || 6;
  const resetScope = s(rule?.reset_scope || "year");
  const sk = scopeKey(resetScope);

  let nextNum = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const cRes = await service
      .from("invoice_counters")
      .select("*")
      .eq("company_id", companyId)
      .eq("rule_id", rule.id)
      .eq("scope_key", sk)
      .maybeSingle();

    if (cRes.error) throw new Error(cRes.error.message);

    if (!cRes.data) {
      const ins = await service
        .from("invoice_counters")
        .insert({ company_id: companyId, rule_id: rule.id, scope_key: sk, last_number: 0 })
        .select("*")
        .maybeSingle();

      if (ins.error) throw new Error(ins.error.message);
    }

    const upd = await service
      .from("invoice_counters")
      .update({ last_number: (cRes.data?.last_number ?? 0) + 1 })
      .eq("company_id", companyId)
      .eq("rule_id", rule.id)
      .eq("scope_key", sk)
      .select("*")
      .maybeSingle();

    if (upd.error) throw new Error(upd.error.message);

    nextNum = Number(upd.data?.last_number ?? 0);
    if (nextNum > 0) break;
  }

  if (!nextNum) throw new Error("INVOICE_NUMBERING_FAILED");

  const number = `${prefix}-${scopeKey(resetScope)}-${pad(nextNum, padding)}`;

  await service.from("invoices").update({ invoice_number: number, numbering_rule_id: rule.id }).eq("id", invoice.id);

  return { invoice_number: number, numbering_rule_id: rule.id };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id || body.invoiceId);
    const backUrl = s(body.back_url || body.backUrl || "");

    if (!invoice_id || !isUuid(invoice_id)) return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });

    const invRes = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (invRes.error || !invRes.data) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const invoice = invRes.data;
    const company_id = s(invoice.company_id);
    if (!company_id) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const allowed = await canSignInvoice(supabase, auth.user.id, company_id);
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const compRes = await service.from("companies").select("*").eq("id", company_id).single();
    if (compRes.error || !compRes.data) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const credRes = await service
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", company_id)
      .eq("is_active", true)
      .maybeSingle();

    const picked = (credRes.data as any)?.signature_config || {};
    const credentialId = s(picked?.credentialId || picked?.credential_id || picked?.digigo_credential_id || "");
    const envPicked = s((credRes.data as any)?.environment || picked?.environment || "");

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED", message: "credentialId manquant" }, { status: 400 });
    }

    const ensured = await ensureInvoiceNumber(service, invoice);
    const finalInvoiceNumber = s(ensured.invoice_number);
    if (!finalInvoiceNumber) return NextResponse.json({ ok: false, error: "INVOICE_NUMBER_MISSING" }, { status: 400 });

    const itemsRes = await service.from("invoice_items").select("*").eq("invoice_id", invoice_id).order("line_no");
    const items = itemsRes.data || [];

    const totals = computeFromItems(items);
    const stamp_enabled = Boolean(invoice.stamp_enabled);
    const stamp_amount = n(invoice.stamp_amount ?? 0);

    const unsigned_xml = buildTeifInvoiceXml({
      invoice,
      company: compRes.data,
      customer: null,
      items,
      totals: {
        ht: totals.ht,
        tva: totals.tva,
        ttc: totals.ttc,
        stamp_enabled,
        stamp_amount,
        net_to_pay: totals.ttc + (stamp_enabled ? stamp_amount : 0),
      },
    });

    if (!unsigned_xml || !unsigned_xml.includes("<")) return NextResponse.json({ ok: false, error: "TEIF_BUILD_FAILED" }, { status: 400 });

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);

    const SESSION_TTL_MINUTES = 30;
    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();

    const sessIns = await service
      .from("digigo_sign_sessions")
      .insert({
        state,
        invoice_id,
        company_id,
        created_by: auth.user.id,
        back_url: backUrl || `/invoices/${invoice_id}`,
        expires_at: expiresAt,
      })
      .select("id")
      .maybeSingle();

    if (sessIns.error) return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", message: sessIns.error.message }, { status: 500 });

    let authorize_url = "";
    try {
      authorize_url = digigoAuthorizeUrl({ credentialId, hashBase64: unsigned_hash, numSignatures: 1, state });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: "DIGIGO_AUTHORIZE_URL_FAILED", message: s(e?.message || e) }, { status: 500 });
    }

    const upsertRes = await service
      .from("invoice_signatures")
      .upsert(
        {
          invoice_id,
          provider: "digigo",
          state: "pending",
          unsigned_hash,
          unsigned_xml,
          signer_user_id: auth.user.id,
          meta: { credentialId, state, environment: envPicked || undefined, session_id: sessIns.data?.id || null },
        },
        { onConflict: "invoice_id" }
      )
      .select("id")
      .single();

    if (upsertRes.error) return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED", message: upsertRes.error.message }, { status: 500 });

    const res = NextResponse.json({ ok: true, authorize_url, state, unsigned_hash, invoice_number: finalInvoiceNumber, environment: envPicked }, { status: 200 });

    const maxAge = SESSION_TTL_MINUTES * 60;

    res.cookies.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_back_url", backUrl || `/invoices/${invoice_id}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: e?.message || "Unknown error" }, { status: 500 });
  }
}
