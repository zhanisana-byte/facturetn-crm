import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invoicePdf } from "@/lib/pdf/invoicePdf";

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

  const { data: company, error: eC } = await supabase.from("companies").select("*").eq("id", (invoice as any).company_id).single();
  if (eC || !company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const { data: items, error: eItems } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  if (eItems) return NextResponse.json({ ok: false, error: "ITEMS_READ_FAILED" }, { status: 500 });

  const invNo = s((invoice as any).invoice_number || (invoice as any).invoice_no || "");
  const docType = s((invoice as any).document_type || "facture");
  const issueDate = s((invoice as any).issue_date || "");

  const stampRaw = (invoice as any).stamp_amount ?? (invoice as any).stamp_duty;
  const stamp = stampRaw == null ? null : Number(stampRaw);

  const totalVat =
    (invoice as any).total_vat != null
      ? Number((invoice as any).total_vat)
      : (invoice as any).total_tva != null
      ? Number((invoice as any).total_tva)
      : null;

  const pdfBytes = await invoicePdf(
    {
      id: invoiceId,
      invoice_no: invNo || `INV-${invoiceId.slice(0, 8)}`,
      issue_date: issueDate || new Date().toISOString().slice(0, 10),
      due_date: s((invoice as any).due_date || ""),
      currency: s((invoice as any).currency || "TND"),
      customer_name: s((invoice as any).customer_name || ""),
      customer_tax_id: s((invoice as any).customer_tax_id || ""),
      customer_address: s((invoice as any).customer_address || ""),
      customer_email: s((invoice as any).customer_email || ""),
      customer_phone: s((invoice as any).customer_phone || ""),
      notes: s((invoice as any).notes || ""),
      subtotal_ht: (invoice as any).subtotal_ht != null ? Number((invoice as any).subtotal_ht) : null,
      vat_amount: totalVat != null ? Number(totalVat) : null,
      total_ttc: (invoice as any).total_ttc != null ? Number((invoice as any).total_ttc) : null,
      net_to_pay: (invoice as any).net_to_pay != null ? Number((invoice as any).net_to_pay) : null,
      stamp_duty: stamp,
      document_type: docType,
      seller_name: s((company as any).company_name || ""),
      seller_tax_id: s((company as any).tax_id || (company as any).taxId || ""),
      seller_address: s((company as any).address || ""),
    },
    (items || []).map((it: any) => ({
      description: s(it.description || ""),
      qty: Number(it.quantity || 0),
      unit_price: Number(it.unit_price_ht || 0),
      vat_pct: Number(it.vat_pct || 0),
      discount_pct: Number(it.discount_pct || 0),
      line_total_ht: Number(it.line_total_ht || 0),
      line_total_ttc: Number(it.line_total_ttc || 0),
    }))
  );

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${docType}_${invNo || invoiceId}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
