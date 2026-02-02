import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !invoice) {
    return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", invoice.company_id)
    .maybeSingle();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:teif:invoice">
  <Header>
    <InvoiceNumber>${esc(invoice.invoice_number)}</InvoiceNumber>
    <IssueDate>${esc(invoice.issue_date)}</IssueDate>
    <Currency>${esc(invoice.currency || "TND")}</Currency>
    <DocumentType>${esc(invoice.document_type || "FACTURE")}</DocumentType>
  </Header>

  <Seller>
    <Name>${esc(company?.company_name)}</Name>
    <TaxId>${esc(company?.tax_id)}</TaxId>
    <Address>${esc(company?.address)}</Address>
    <City>${esc(company?.city)}</City>
    <Country>TN</Country>
  </Seller>

  <Buyer>
    <Name>${esc(invoice.customer_name)}</Name>
    <TaxId>${esc(invoice.customer_tax_id)}</TaxId>
    <Address>${esc(invoice.customer_address)}</Address>
  </Buyer>

  <Items>
    ${(items || [])
      .map(
        (it: any, i: number) => `
    <Item>
      <Line>${i + 1}</Line>
      <Description>${esc(it.description)}</Description>
      <Quantity>${it.quantity}</Quantity>
      <UnitPrice>${it.unit_price_ht}</UnitPrice>
      <VATRate>${it.vat_pct}</VATRate>
      <LineTotal>${it.line_total_ht}</LineTotal>
    </Item>`
      )
      .join("")}
  </Items>

  <Totals>
    <TotalHT>${invoice.total_ht}</TotalHT>
    <TotalVAT>${invoice.total_vat}</TotalVAT>
    <Stamp>${invoice.stamp_amount || 0}</Stamp>
    <TotalTTC>${invoice.total_ttc}</TotalTTC>
  </Totals>
</Invoice>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoice-${id}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
