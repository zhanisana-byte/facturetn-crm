import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id  } = await ctx.params;
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
    return NextResponse.json({ ok: false, error: invErr?.message || "Invoice not found" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <Id>${invoice.id}</Id>
  <Number>${invoice.invoice_number ?? ""}</Number>
  <IssueDate>${invoice.issue_date ?? ""}</IssueDate>
  <Currency>${invoice.currency ?? "TND"}</Currency>
  <Totals>
    <SubtotalHT>${invoice.subtotal_ht ?? 0}</SubtotalHT>
    <TotalVAT>${invoice.total_vat ?? 0}</TotalVAT>
    <TotalTTC>${invoice.total_ttc ?? invoice.total ?? 0}</TotalTTC>
    <NetToPay>${invoice.net_to_pay ?? invoice.total_ttc ?? invoice.total ?? 0}</NetToPay>
  </Totals>
  <Items>
    ${(items ?? [])
      .map(
        (it: any) => `
    <Item>
      <LineNo>${it.line_no ?? ""}</LineNo>
      <Description>${(it.description ?? "").replaceAll("&", "&amp;")}</Description>
      <Quantity>${it.quantity ?? 0}</Quantity>
      <UnitPriceHT>${it.unit_price_ht ?? 0}</UnitPriceHT>
      <VatPct>${it.vat_pct ?? 0}</VatPct>
      <LineTotalHT>${it.line_total_ht ?? 0}</LineTotalHT>
      <LineTotalTTC>${it.line_total_ttc ?? 0}</LineTotalTTC>
    </Item>`
      )
      .join("")}
  </Items>
</Invoice>`;

  const filename = `invoice-${invoice.invoice_number || invoice.id}.xml`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
