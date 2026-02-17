import { NextResponse } from "next/server";
import crypto from "crypto";
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
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
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

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id || body.invoiceId);
    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const invRes = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (!invRes.data) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const invoice: any = invRes.data;
    const company_id = s(invoice.company_id);

    const allowed =
      (await canCompanyAction(supabase, auth.user.id, company_id, "validate_invoices" as any)) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn" as any)) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "create_invoices" as any));

    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const compRes = await service.from("companies").select("*").eq("id", company_id).single();
    if (!compRes.data) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const env = s(body.environment || "production") as any;

    const credRes = await service
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", company_id)
      .eq("environment", env)
      .single();

    if (!credRes.data || credRes.data.signature_provider !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cred: any = credRes.data;
    const cfg = cred.signature_config && typeof cred.signature_config === "object" ? cred.signature_config : {};
    const credentialId = s(cfg.digigo_signer_email || cred.credential_from_db || cred.cert_email);

    if (!credentialId) return NextResponse.json({ ok: false, error: "DIGIGO_EMAIL_MISSING" }, { status: 400 });

    const itemsRes = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("line_no");

    if (!itemsRes.data || itemsRes.data.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_ITEMS" }, { status: 400 });
    }

    const unsigned_xml = buildTeifInvoiceXml({
      invoiceId: invoice_id,
      company: {
        name: s(compRes.data.company_name),
        taxId: s(compRes.data.tax_id),
        address: s(compRes.data.address),
        city: s(compRes.data.city),
        postalCode: s(compRes.data.postal_code),
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
        ht: n(invoice.subtotal_ht),
        tva: n(invoice.total_vat),
        ttc: n(invoice.total_ttc),
        stampEnabled: !!invoice.stamp_enabled,
        stampAmount: n(invoice.stamp_amount),
      },
      items: itemsRes.data.map((it: any) => ({
        description: it.description,
        qty: n(it.quantity),
        price: n(it.unit_price_ht),
        vat: n(it.vat_pct),
      })),
      purpose: "ttn",
    } as any);

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);

    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        provider: "digigo",
        state: "pending",
        unsigned_xml,
        unsigned_hash,
        signer_user_id: auth.user.id,
        company_id,
        environment: env,
        meta: { credentialId, environment: env, state: "pending" },
      } as any,
      { onConflict: "invoice_id" }
    );

    const state = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const back_url = `/invoices/${invoice_id}`;

    const sessIns = await service
      .from("digigo_sign_sessions")
      .insert({
        state,
        invoice_id,
        company_id,
        created_by: auth.user.id,
        back_url,
        status: "pending",
        expires_at,
        environment: env,
      })
      .select("id")
      .maybeSingle();

    if (sessIns.error) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", details: sessIns.error.message }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: unsigned_hash,
      numSignatures: 1,
      state,
      environment: env,
    });

    const res = NextResponse.json({ ok: true, authorize_url, state }, { status: 200 });

    const secure = isHttps(req);
    const maxAge = 60 * 30;

    res.cookies.set("digigo_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_back_url", back_url, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: s(e?.message) }, { status: 500 });
  }
}
