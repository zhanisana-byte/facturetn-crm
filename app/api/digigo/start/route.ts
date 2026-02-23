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

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id || body.invoiceId);
    const back_url = s(body.back_url || body.backUrl);

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const invRes = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (invRes.error || !invRes.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const invoice: any = invRes.data;
    const company_id = s(invoice.company_id);
    if (!company_id || !isUuid(company_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_COMPANY_ID" }, { status: 400 });
    }

    const allowed =
      (await canCompanyAction(supabase, auth.user.id, company_id, "validate_invoices" as any)) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn" as any)) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "create_invoices" as any));

    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const compRes = await service.from("companies").select("*").eq("id", company_id).single();
    if (compRes.error || !compRes.data) {
      return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const credRes = await service
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", company_id)
      .eq("environment", "production")
      .maybeSingle();

    if (credRes.error || !credRes.data) {
      return NextResponse.json({ ok: false, error: "TTN_CREDENTIALS_NOT_FOUND" }, { status: 400 });
    }

    const cred: any = credRes.data;
    if (s(cred.signature_provider) !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg = cred.signature_config && typeof cred.signature_config === "object" ? cred.signature_config : {};
    const credentialId = s(cfg.digigo_signer_email || cfg.credentialId || cfg.credential_id || cred.signer_email || cred.cert_email);

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "MISSING_CREDENTIAL_ID" }, { status: 400 });
    }

    const itemsRes = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("line_no", { ascending: true });

    if (itemsRes.error) {
      return NextResponse.json({ ok: false, error: "ITEMS_LOAD_FAILED", details: itemsRes.error.message }, { status: 500 });
    }

    const items = Array.isArray(itemsRes.data) ? itemsRes.data : [];
    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_ITEMS" }, { status: 400 });
    }

    const company: any = compRes.data;

    const unsigned_xml = buildTeifInvoiceXml({
      invoiceId: invoice_id,
      company: {
        name: s(company.company_name),
        taxId: s(company.tax_id),
        address: s(company.address || company.address_line),
        city: s(company.city),
        postalCode: s(company.postal_code),
        country: s(company.country_code || company.country || "TN") || "TN",
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
      items: items.map((it: any) => ({
        description: it.description,
        qty: n(it.quantity),
        price: n(it.unit_price_ht),
        vat: n(it.vat_pct),
      })),
      purpose: "ttn",
    } as any);

    const hash = sha256Base64Utf8(unsigned_xml);

    const upSig = await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        provider: "digigo",
        state: "pending",
        unsigned_xml,
        unsigned_hash: hash,
        signer_user_id: auth.user.id,
        company_id,
        environment: "production",
        meta: { credentialId, back_url: back_url || `/invoices/${invoice_id}` },
      },
      { onConflict: "invoice_id" }
    );

    if (upSig.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED", details: upSig.error.message }, { status: 500 });
    }

    const state = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const backUrlFinal = back_url || `/invoices/${invoice_id}`;

    const sessIns = await service.from("digigo_sign_sessions").insert({
      state,
      invoice_id,
      company_id,
      created_by: auth.user.id,
      back_url: backUrlFinal,
      status: "pending",
      expires_at,
      environment: "production",
    });

    if (sessIns.error) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", details: sessIns.error.message }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: hash,
      numSignatures: 1,
      state,
    });

    return NextResponse.json({ ok: true, authorize_url }, { status: 200 });
  } catch (e: any) {
    console.error("DIGIGO_START_ERROR", e);
    return NextResponse.json({ ok: false, error: "START_FAILED", details: String(e?.message || e) }, { status: 500 });
  }
}
