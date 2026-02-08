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
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id || body.invoiceId);

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const invRes = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (invRes.error || !invRes.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const invoice = invRes.data;

    if (!invoice.invoice_number) {
      return NextResponse.json({ ok: false, error: "INVOICE_NUMBER_MISSING" }, { status: 400 });
    }

    const company_id = s(invoice.company_id);

    const allowed =
      (await canCompanyAction(supabase, auth.user.id, company_id, "validate_invoices")) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn")) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "create_invoices"));

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const compRes = await service.from("companies").select("*").eq("id", company_id).single();
    if (!compRes.data) {
      return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    const credRes = await service
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", company_id)
      .eq("environment", "test")
      .single();

    if (!credRes.data || credRes.data.signature_provider !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cred = credRes.data;
    const cfg = typeof cred.signature_config === "object" ? cred.signature_config : {};
    const credentialId = s(cfg.digigo_signer_email || cred.cert_email);

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_EMAIL_MISSING" }, { status: 400 });
    }

    const sigRes = await service
      .from("invoice_signatures")
      .select("state, unsigned_xml, unsigned_hash")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    let unsigned_xml = "";
    let hash = "";

    if (sigRes.data && (sigRes.data.state === "pending" || sigRes.data.state === "signed")) {
      unsigned_xml = s(sigRes.data.unsigned_xml);
      hash = s(sigRes.data.unsigned_hash);

      if (!unsigned_xml || !hash) {
        return NextResponse.json({ ok: false, error: "XML_FROZEN_BUT_MISSING" }, { status: 500 });
      }
    } else {
      const itemsRes = await service
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoice_id)
        .order("line_no");

      if (!itemsRes.data || itemsRes.data.length === 0) {
        return NextResponse.json({ ok: false, error: "NO_ITEMS" }, { status: 400 });
      }

      unsigned_xml = buildTeifInvoiceXml({
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
          stampEnabled: invoice.stamp_enabled,
          stampAmount: n(invoice.stamp_amount),
        },
        items: itemsRes.data.map((it: any) => ({
          description: it.description,
          qty: n(it.quantity),
          price: n(it.unit_price_ht),
          vat: n(it.vat_pct),
        })),
        purpose: "ttn",
      });

      hash = sha256Base64Utf8(unsigned_xml);

      await service.from("invoice_signatures").upsert({
        invoice_id,
        provider: "digigo",
        state: "pending",
        unsigned_xml,
        unsigned_hash: hash,
        signer_user_id: auth.user.id,
        meta: { credentialId, environment: "test" },
      });
    }

    const state = `${invoice_id}.${crypto.randomBytes(8).toString("hex")}`;

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: hash,
      numSignatures: 1,
      state,
    });

    return NextResponse.json({ ok: true, authorize_url });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "UNKNOWN_ERROR", message: s(e?.message) },
      { status: 500 }
    );
  }
}
