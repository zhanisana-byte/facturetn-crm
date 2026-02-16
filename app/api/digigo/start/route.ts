import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import { buildTeifInvoiceXml } from "@/lib/ttn/teifXml";
import { sha256Base64Utf8, digigoAuthorizeUrl } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function ymdYear(v: any) {
  const t = String(v ?? "").trim();
  const m = t.match(/^(\d{4})-\d{2}-\d{2}$/);
  return m ? m[1] : String(new Date().getFullYear());
}

function makeInvoiceNumber(invoice: any) {
  const year = ymdYear(invoice?.issue_date);
  const tail = String(invoice?.id ?? "").replace(/-/g, "").slice(0, 6).toUpperCase();
  return `FACT-${year}-${tail || "000000"}`;
}

async function ensureInvoiceNumber(service: any, invoice: any) {
  const current = String(invoice?.invoice_number ?? "").trim();
  if (current) return current;

  const fallback = makeInvoiceNumber(invoice);

  const upd = await service
    .from("invoices")
    .update({ invoice_number: fallback })
    .eq("id", invoice.id)
    .select("invoice_number")
    .single();

  const saved = String(upd.data?.invoice_number ?? "").trim();
  return saved || fallback;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function resolveCredForCompany(service: any, company_id: string, env: string) {
  const tryEnv = async (e: string) =>
    service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email, environment")
      .eq("company_id", company_id)
      .eq("environment", e)
      .maybeSingle();

  let r = await tryEnv(env);
  if (r.data) return r;

  r = await tryEnv("production");
  if (r.data) return r;

  return await tryEnv("test");
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();
    const cookieStore = await cookies();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id || body.invoiceId);
    const back_url = s(body.back_url || body.backUrl || body.back);
    const env = s(body.environment || body.env || "test") || "test";

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const inv = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (!inv.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const invoice: any = inv.data;
    const company_id = s(invoice.company_id);

    const allowed =
      (await canCompanyAction(supabase, auth.user.id, company_id, "validate_invoices" as any)) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn" as any)) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "create_invoices" as any));

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const invoice_number = await ensureInvoiceNumber(service, invoice);
    if (!invoice_number) {
      return NextResponse.json({ ok: false, error: "INVOICE_NUMBER_MISSING" }, { status: 400 });
    }
    invoice.invoice_number = invoice_number;

    const items = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("line_no");

    if (!items.data || items.data.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_ITEMS" }, { status: 400 });
    }

    const comp = await service.from("companies").select("*").eq("id", company_id).single();
    if (!comp.data) {
      return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const credRes = await resolveCredForCompany(service, company_id, env);
    const cred: any = credRes.data;

    if (!cred || cred.signature_provider !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg = cred.signature_config && typeof cred.signature_config === "object" ? cred.signature_config : {};
    const credentialId = s(cfg.digigo_signer_email || cred.cert_email);
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_EMAIL_MISSING" }, { status: 400 });
    }

    const redirectUri = s(process.env.DIGIGO_REDIRECT_URI);
    if (!redirectUri) {
      return NextResponse.json({ ok: false, error: "DIGIGO_REDIRECT_URI_MISSING" }, { status: 500 });
    }

    const unsigned_xml = buildTeifInvoiceXml({
      invoiceId: invoice_id,
      company: {
        name: s(comp.data.company_name),
        taxId: s(comp.data.tax_id),
        address: s(comp.data.address),
        city: s(comp.data.city),
        postalCode: s(comp.data.postal_code),
        country: "TN",
      },
      invoice: {
        documentType: invoice.document_type,
        number: invoice.invoice_number,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        currency: invoice.currency,
        customerName: invoice.customer_name,
        customerTaxId: invoice.customer_tax_id,
        customerEmail: invoice.customer_email,
        customerAddress: invoice.customer_address,
      },
      totals: {
        ht: Number(invoice.subtotal_ht ?? 0),
        tva: Number(invoice.total_vat ?? 0),
        ttc: Number(invoice.total_ttc ?? 0),
        stampEnabled: !!invoice.stamp_enabled,
        stampAmount: Number(invoice.stamp_amount ?? 0),
      },
      items: items.data.map((it: any) => ({
        description: it.description,
        qty: Number(it.quantity ?? 0),
        price: Number(it.unit_price_ht ?? 0),
        vat: Number(it.vat_pct ?? 0),
      })),
      purpose: "ttn",
    } as any);

    const hash = sha256Base64Utf8(unsigned_xml);

    await service.from("invoice_signatures").upsert({
      invoice_id,
      provider: "digigo",
      state: "pending",
      unsigned_xml,
      unsigned_hash: hash,
      signer_user_id: auth.user.id,
      meta: { credentialId, environment: s(cred.environment || env) },
    });

    const state = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const final_back_url = back_url || `/invoices/${invoice_id}`;

    const sessIns = await service
      .from("digigo_sign_sessions")
      .insert({
        state,
        invoice_id,
        company_id,
        created_by: auth.user.id,
        back_url: final_back_url,
        status: "pending",
        expires_at,
        environment: s(cred.environment || env),
      })
      .select("id")
      .maybeSingle();

    if (sessIns.error) {
      return NextResponse.json(
        { ok: false, error: "SESSION_CREATE_FAILED", details: sessIns.error.message },
        { status: 500 }
      );
    }

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: hash,
      redirectUri,
      numSignatures: 1,
      state,
    });

    const res = NextResponse.json({ ok: true, authorize_url, state, redirectUri }, { status: 200 });

    cookieStore.set("digigo_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1800 });
    cookieStore.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1800 });
    cookieStore.set("digigo_back_url", final_back_url, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1800 });
    cookieStore.set("digigo_redirect_uri", redirectUri, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1800 });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: s(e?.message) }, { status: 500 });
  }
}
