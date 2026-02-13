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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isHttps(req: Request) {
  const proto = s(req.headers.get("x-forwarded-proto"));
  return proto ? proto === "https" : true;
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
    const back_url = s(body.back_url || body.backUrl || body.back);

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
      (await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn" as any));

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const comp = await service.from("companies").select("*").eq("id", company_id).single();
    if (!comp.data) {
      return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    }
    const company: any = comp.data;

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
        name: s(company.company_name || company.legal_name || company.commercial_name || ""),
        taxId: s(company.tax_id || company.vat_number || ""),
        address: s(company.address || company.address_line || ""),
        city: s(company.city || company.city_name || ""),
        postalCode: s(company.postal_code || company.postal_code2 || ""),
        country: s(company.country || company.country_code || "TN"),
      },
      invoice: {
        documentType: s(invoice.document_type || invoice.documentType || "facture"),
        number: s(invoice.invoice_number || invoice.number || ""),
        issueDate: s(invoice.issue_date || invoice.issueDate || ""),
        dueDate: s(invoice.due_date || invoice.dueDate || ""),
        currency: s(invoice.currency || "TND"),
        customerName: s(invoice.customer_name || ""),
        customerTaxId: s(invoice.customer_tax_id || invoice.customer_tax_id2 || invoice.customerTaxId || ""),
        customerEmail: s(invoice.customer_email || ""),
        customerPhone: s(invoice.customer_phone || ""),
        customerAddress: s(invoice.customer_address || ""),
        notes: s(invoice.notes || ""),
      },
      totals: {
        ht: Number(invoice.subtotal_ht ?? 0),
        tva: Number(invoice.total_vat ?? 0),
        ttc: Number(invoice.total_ttc ?? 0),
        stampEnabled: Boolean(invoice.stamp_enabled),
        stampAmount: Number(invoice.stamp_amount ?? 0),
      },
      items: itemsRes.data.map((it: any) => ({
        description: s(it.description || ""),
        qty: Number(it.quantity ?? 0),
        price: Number(it.unit_price_ht ?? 0),
        vat: Number(it.vat_pct ?? 0),
        discount: Number(it.discount_pct ?? 0),
      })),
      purpose: "ttn",
    });

    const hash = sha256Base64Utf8(unsigned_xml);

    const credRes = await service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email, environment")
      .eq("company_id", company_id)
      .maybeSingle();

    if (!credRes.data || s((credRes.data as any).signature_provider) !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg =
      (credRes.data as any)?.signature_config && typeof (credRes.data as any).signature_config === "object"
        ? (credRes.data as any).signature_config
        : {};

    const credentialId = s(
      cfg.digigo_signer_email || cfg.credentialId || cfg.signer_email || (credRes.data as any).cert_email
    );

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        provider: "digigo",
        state: "pending",
        unsigned_xml,
        unsigned_hash: hash,
        signer_user_id: auth.user.id,
        meta: { credentialId, environment: s((credRes.data as any)?.environment || "test") },
      },
      { onConflict: "invoice_id" }
    );

    const state = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const safeBackUrl = back_url || `/invoices/${invoice_id}`;

    const sessIns = await service
      .from("digigo_sign_sessions")
      .insert({
        state,
        invoice_id,
        company_id,
        created_by: auth.user.id,
        back_url: safeBackUrl,
        status: "pending",
        expires_at,
        environment: s((credRes.data as any)?.environment || "test"),
      })
      .select("id")
      .maybeSingle();

    if (sessIns.error) {
      return NextResponse.json(
        { ok: false, error: "SESSION_CREATE_FAILED", details: sessIns.error.message },
        { status: 500 }
      );
    }

    const redirectUri = s(process.env.DIGIGO_REDIRECT_URI);
    if (!redirectUri || !/^https?:\/\//i.test(redirectUri)) {
      return NextResponse.json({ ok: false, error: "DIGIGO_REDIRECT_URI_INVALID" }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: hash,
      numSignatures: 1,
      state,
      redirectUri,
    });

    const res = NextResponse.json({ ok: true, authorize_url, state }, { status: 200 });

    const secure = isHttps(req);
    const maxAge = 60 * 30;

    res.cookies.set("digigo_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_back_url", safeBackUrl, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "UNKNOWN_ERROR", message: s(e?.message || "") },
      { status: 500 }
    );
  }
}
