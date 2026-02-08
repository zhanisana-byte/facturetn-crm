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

function friendlyTeifError(msg: string) {
  const m = s(msg);
  if (!m) return "Erreur TEIF.";
  if (m.toLowerCase().includes("max size")) return "TEIF trop volumineux.";
  if (m.toLowerCase().includes("minimum")) return "TEIF incomplet (champs obligatoires manquants).";
  return m;
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
        .insert({
          company_id: companyId,
          rule_id: rule.id,
          scope_key: sk,
          last_number: 0,
        })
        .select("*")
        .single();

      if (ins.error) continue;
    }

    const cRes2 = await service
      .from("invoice_counters")
      .select("*")
      .eq("company_id", companyId)
      .eq("rule_id", rule.id)
      .eq("scope_key", sk)
      .single();

    if (cRes2.error) throw new Error(cRes2.error.message);

    const counter = cRes2.data;
    const last = Number(counter?.last_number ?? 0) || 0;
    const wanted = last + 1;

    const upd = await service
      .from("invoice_counters")
      .update({ last_number: wanted, updated_at: new Date().toISOString() })
      .eq("id", counter.id)
      .eq("last_number", last)
      .select("id")
      .maybeSingle();

    if (!upd.error && upd.data) {
      nextNum = wanted;
      break;
    }
  }

  if (!nextNum) {
    nextNum = Math.floor(Math.random() * 900000) + 100000;
  }

  const finalNumber = `${prefix}${sep}${sk}${sep}${pad(nextNum, padding)}`;
  return { invoice_number: finalNumber, numbering_rule_id: s(rule?.id || "") };
}

async function pickDigigoCredential(service: any, companyId: string, forcedEnv?: string) {
  const envs = forcedEnv ? [forcedEnv] : ["test", "production"];

  for (const env of envs) {
    const r = await service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email, environment")
      .eq("company_id", companyId)
      .eq("environment", env)
      .maybeSingle();

    if (r.error) throw new Error(r.error.message);
    if (!r.data) continue;

    const provider = s(r.data.signature_provider || "none");
    if (provider !== "digigo") continue;

    const cfg = r.data.signature_config && typeof r.data.signature_config === "object" ? r.data.signature_config : {};
    const credentialId = s((cfg as any)?.digigo_signer_email || r.data.cert_email || "");
    if (!credentialId) continue;

    return { env, credentialId };
  }

  return { env: "", credentialId: "" };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id ?? body?.invoiceId ?? body?.id);
    const askedEnv = s(body?.environment);
    const backUrl = s(body?.back_url ?? body?.backUrl ?? "");

    if (!invoice_id) return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });
    if (!isUuid(invoice_id)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_INVOICE_ID", message: "invoice_id doit être un UUID." },
        { status: 400 }
      );
    }

    const invRes = await service.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
    if (invRes.error) {
      return NextResponse.json({ ok: false, error: "INVOICE_READ_FAILED", message: invRes.error.message }, { status: 500 });
    }
    const invoice = invRes.data;
    if (!invoice) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const company_id = s((invoice as any)?.company_id);
    if (!company_id) return NextResponse.json({ ok: false, error: "INVOICE_NO_COMPANY" }, { status: 400 });

    const allowed = await canSignInvoice(supabase, auth.user.id, company_id);
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const compRes = await service.from("companies").select("*").eq("id", company_id).maybeSingle();
    if (compRes.error) {
      return NextResponse.json({ ok: false, error: "COMPANY_READ_FAILED", message: compRes.error.message }, { status: 500 });
    }
    const company = compRes.data;
    if (!company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const picked = await pickDigigoCredential(service, company_id, askedEnv || undefined);
    if (!picked.credentialId) {
      return NextResponse.json(
        { ok: false, error: "EMAIL_DIGIGO_COMPANY_MISSING", message: "Renseignez l’email DigiGo dans Paramètres DigiGo (société)." },
        { status: 400 }
      );
    }

    let finalInvoiceNumber = s((invoice as any)?.invoice_number);
    let finalRuleId = s((invoice as any)?.numbering_rule_id);

    if (!finalInvoiceNumber) {
      const ensured = await ensureInvoiceNumber(service, invoice);
      finalInvoiceNumber = ensured.invoice_number;
      finalRuleId = ensured.numbering_rule_id;

      const up = await service
        .from("invoices")
        .update({
          invoice_number: finalInvoiceNumber,
          numbering_rule_id: finalRuleId || (invoice as any)?.numbering_rule_id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice_id)
        .select("id")
        .maybeSingle();

      if (up.error) {
        return NextResponse.json({ ok: false, error: "INVOICE_NUMBER_UPDATE_FAILED", message: up.error.message }, { status: 500 });
      }
    }

    const itRes = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("line_no", { ascending: true });

    if (itRes.error) return NextResponse.json({ ok: false, error: "ITEMS_READ_FAILED", message: itRes.error.message }, { status: 500 });

    const items = itRes.data ?? [];
    const calc = computeFromItems(items);

    const stampEnabled = Boolean((invoice as any)?.stamp_enabled);
    const stampAmount = n((invoice as any)?.stamp_amount);

    const ht = calc.ht;
    const tva = calc.tva;
    const ttc = calc.ttc + (stampEnabled ? stampAmount : 0);

    let unsigned_xml = "";
    try {
      unsigned_xml = buildTeifInvoiceXml({
        invoiceId: invoice_id,
        company: {
          name: s((company as any)?.company_name ?? ""),
          taxId: s((company as any)?.tax_id ?? (company as any)?.taxId ?? ""),
          address: s((company as any)?.address ?? ""),
          city: s((company as any)?.city ?? ""),
          postalCode: s((company as any)?.postal_code ?? (company as any)?.zip ?? ""),
          country: s((company as any)?.country ?? "TN"),
        },
        invoice: {
          documentType: s((invoice as any)?.document_type ?? "facture"),
          number: finalInvoiceNumber,
          issueDate: s((invoice as any)?.issue_date ?? ""),
          dueDate: s((invoice as any)?.due_date ?? ""),
          currency: s((invoice as any)?.currency ?? "TND"),
          customerName: s((invoice as any)?.customer_name ?? ""),
          customerTaxId: s((invoice as any)?.customer_tax_id ?? ""),
          customerEmail: s((invoice as any)?.customer_email ?? ""),
          customerPhone: s((invoice as any)?.customer_phone ?? ""),
          customerAddress: s((invoice as any)?.customer_address ?? ""),
          notes: s((invoice as any)?.notes ?? (invoice as any)?.note ?? ""),
        },
        totals: {
          ht,
          tva,
          ttc,
          stampEnabled,
          stampAmount,
        },
        items: items.map((it: any) => ({
          description: s(it.description ?? ""),
          qty: n(it.quantity ?? 1),
          price: n(it.unit_price_ht ?? it.unit_price ?? 0),
          vat: n(it.vat_pct ?? it.vatPct ?? 0),
          discount: n(it.discount_pct ?? it.discountPct ?? 0),
        })),
        purpose: "ttn",
      });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: "TEIF_BUILD_FAILED", message: friendlyTeifError(e?.message || String(e)) },
        { status: 400 }
      );
    }

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);

    const state = `${invoice_id}:${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

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

    if (sessIns.error) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", message: sessIns.error.message }, { status: 500 });
    }

    let authorize_url = "";
    try {
      authorize_url = digigoAuthorizeUrl({
        credentialId: picked.credentialId,
        hashBase64: unsigned_hash,
        numSignatures: 1,
        state,
      });
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
          meta: {
            credentialId: picked.credentialId,
            state,
            environment: picked.env || undefined,
            session_id: sessIns.data?.id || null,
          },
        },
        { onConflict: "invoice_id" }
      )
      .select("id")
      .single();

    if (upsertRes.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED", message: upsertRes.error.message }, { status: 500 });
    }

    const res = NextResponse.json(
      { ok: true, authorize_url, state, unsigned_hash, invoice_number: finalInvoiceNumber, environment: picked.env },
      { status: 200 }
    );

    res.cookies.set("digigo_invoice_id", invoice_id, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });

    res.cookies.set("digigo_back_url", backUrl || `/invoices/${invoice_id}`, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });

    res.cookies.set("digigo_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: e?.message || "Unknown error" }, { status: 500 });
  }
}
