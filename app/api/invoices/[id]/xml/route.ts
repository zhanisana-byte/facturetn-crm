import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTeifInvoiceXml, enforceMaxSize, validateTeifMinimum } from "@/lib/ttn/teifXml";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const invoiceId = s(params?.id);
  if (!invoiceId) return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });

  const { data: invoice, error: eInv } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
  if (eInv || !invoice) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const companyId = s((invoice as any).company_id);
  const { data: company, error: eC } = await supabase.from("companies").select("*").eq("id", companyId).single();
  if (eC || !company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const { data: items, error: eItems } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  if (eItems) return NextResponse.json({ ok: false, error: "ITEMS_READ_FAILED" }, { status: 500 });

  const teifXml = buildTeifInvoiceXml({
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
      number: s((invoice as any)?.invoice_number ?? ""),
      issueDate: s((invoice as any)?.issue_date ?? ""),
      currency: s((invoice as any)?.currency ?? "TND"),
      customerName: s((invoice as any)?.customer_name ?? ""),
      customerTaxId: s((invoice as any)?.customer_tax_id ?? ""),
      customerEmail: s((invoice as any)?.customer_email ?? ""),
      customerPhone: s((invoice as any)?.customer_phone ?? ""),
      customerAddress: s((invoice as any)?.customer_address ?? ""),
      notes: s((invoice as any)?.notes ?? ""),
    },
    totals: {
      ht: Number((invoice as any)?.subtotal_ht ?? 0),
      tva: Number((invoice as any)?.total_vat ?? (invoice as any)?.total_tva ?? 0),
      ttc: Number((invoice as any)?.total_ttc ?? 0),
      stampEnabled: true,
      stampAmount: Number((invoice as any)?.stamp_amount ?? (invoice as any)?.stamp_duty ?? 0),
    },
    items: (items ?? []).map((it: any) => ({
      description: s(it.description ?? ""),
      qty: Number(it.quantity ?? 1),
      price: Number(it.unit_price_ht ?? 0),
      vat: Number(it.vat_pct ?? 0),
      discount: Number(it.discount_pct ?? 0),
    })),
  });

  const problems = validateTeifMinimum(teifXml);
  if (problems.length) return NextResponse.json({ ok: false, error: "TEIF_INVALID", details: problems }, { status: 400 });

  const sized = enforceMaxSize(teifXml);
  const xml = sized.xml;

  const filename = `invoice_${invoiceId}.xml`;
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
