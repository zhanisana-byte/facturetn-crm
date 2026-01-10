import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V16: TEIF/XML export with hard limit <= 50 Ko.
 * NOTE: Full TEIF/XSD validation requires the official XSD from TTN.
 * We generate a compact, deterministic XML with the fields we have in DB.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json(
        { ok: false, error: invErr?.message || "Not found" },
        { status: 404 }
      );
    }

    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .order("line_no", { ascending: true });

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", (invoice as any).company_id)
      .single();

    const xml = buildCompactTeifXml({ invoice, items: items ?? [], company });

    const sizeBytes = Buffer.byteLength(xml, "utf8");

    // Hard limit required by TTN pricing/processing threshold: 50 Ko
    if (sizeBytes > 50_000) {
      return NextResponse.json(
        {
          ok: false,
          error: `XML dépasse la limite TTN (50 Ko). Taille actuelle: ${sizeBytes} octets.`,
        },
        { status: 413 }
      );
    }

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoice-${(invoice as any).id}.xml"`,
        "X-XML-Size": String(sizeBytes),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}

function esc(v: any) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function n3(v: any) {
  const x = Number(v || 0);
  return x.toFixed(3);
}

function minifyXml(input: string) {
  return input.replace(/\r?\n+/g, "").replace(/>\s+</g, "><").trim();
}

/**
 * Minimal TEIF-like structure (invoice header + parties + lines + totals).
 * Replace tags later if TTN provides official XSD / exact tag names.
 */
function buildCompactTeifXml({
  invoice,
  items,
  company,
}: {
  invoice: any;
  items: any[];
  company: any;
}) {
  const invNo = invoice.invoice_number || invoice.unique_reference || invoice.id;
  const issueDate = invoice.issue_date || "";
  const currency = invoice.currency || "TND";

  const supplierName = company?.company_name || "";
  const supplierMF = company?.tax_id || "";
  const supplierAddr = company?.address || "";

  const buyerName = invoice.customer_name || "";
  const buyerMF = invoice.customer_tax_id || "";
  const buyerAddr = invoice.customer_address || "";

  const stampEnabled = !!invoice.stamp_enabled;
  const stampAmount = Number(invoice.stamp_amount || 0);

  const lines = (items || []).map((it: any, idx: number) => {
    const qty = Number(it.quantity || 0);
    const pu = Number(it.unit_price_ht || 0);
    const vatPct = Number(it.vat_pct || 0);
    const totalHT = Number(it.line_total_ht || 0);
    const vatAmt = Number(it.line_vat_amount || 0);
    const totalTTC = Number(it.line_total_ttc || 0);

    return `
      <Line>
        <LineNo>${esc(it.line_no ?? idx + 1)}</LineNo>
        <Description>${esc(it.description || "")}</Description>
        <Quantity>${n3(qty)}</Quantity>
        <UnitPriceHT>${n3(pu)}</UnitPriceHT>
        <VatPct>${n3(vatPct)}</VatPct>
        <LineTotalHT>${n3(totalHT)}</LineTotalHT>
        <LineVatAmount>${n3(vatAmt)}</LineVatAmount>
        <LineTotalTTC>${n3(totalTTC)}</LineTotalTTC>
      </Line>`;
  });

  const subtotalHT = Number(invoice.subtotal_ht || 0);
  const totalVat = Number(invoice.total_vat || 0);
  const totalTTC = Number(invoice.total_ttc || 0);
  const netToPay = Number(invoice.net_to_pay || totalTTC);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TEIF>
  <Header>
    <DocumentType>${esc(invoice.document_type || "facture")}</DocumentType>
    <InvoiceNumber>${esc(invNo)}</InvoiceNumber>
    <IssueDate>${esc(issueDate)}</IssueDate>
    <Currency>${esc(currency)}</Currency>
    <UniqueReference>${esc(invoice.unique_reference || "")}</UniqueReference>
  </Header>

  <Supplier>
    <Name>${esc(supplierName)}</Name>
    <MF>${esc(supplierMF)}</MF>
    <Address>${esc(supplierAddr)}</Address>
  </Supplier>

  <Buyer>
    <Name>${esc(buyerName)}</Name>
    <MF>${esc(buyerMF)}</MF>
    <Address>${esc(buyerAddr)}</Address>
    <Email>${esc(invoice.customer_email || "")}</Email>
    <Phone>${esc(invoice.customer_phone || "")}</Phone>
  </Buyer>

  <Lines>${lines.join("")}
  </Lines>

  <Totals>
    <SubtotalHT>${n3(subtotalHT)}</SubtotalHT>
    <TotalVat>${n3(totalVat)}</TotalVat>
    <StampEnabled>${stampEnabled ? "true" : "false"}</StampEnabled>
    <StampAmount>${n3(stampAmount)}</StampAmount>
    <TotalTTC>${n3(totalTTC)}</TotalTTC>
    <NetToPay>${n3(netToPay)}</NetToPay>
  </Totals>

  <TTN>
    <Status>${esc(invoice.ttn_status || "not_sent")}</Status>
    <Reference>${esc(invoice.ttn_reference || "")}</Reference>
  </TTN>
</TEIF>`;

  return minifyXml(xml);
}
