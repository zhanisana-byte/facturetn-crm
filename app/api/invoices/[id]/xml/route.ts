import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCompactTeifXml, validateTeifMinimum, enforceMaxSize } from "@/lib/ttn/teif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const invoiceId = s(id);
  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  const { data: invoice, error: invErr } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const companyId = s((invoice as any).company_id);
  if (!companyId) return NextResponse.json({ ok: false, error: "INVOICE_NO_COMPANY" }, { status: 404 });

  const [{ data: company, error: cErr }, { data: items, error: itErr }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
    supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("line_no", { ascending: true }),
  ]);

  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
  if (itErr) return NextResponse.json({ ok: false, error: itErr.message }, { status: 500 });
  if (!company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const docType = s((invoice as any).document_type ?? "facture").toLowerCase();
  const purpose = docType === "devis" ? "preview" : "ttn";

  const teifXml = buildCompactTeifXml({
    invoiceId,
    companyId,
    documentType: docType as any,
    invoiceNumber: s((invoice as any).invoice_number ?? ""),
    issueDate: s((invoice as any).issue_date ?? (invoice as any).created_at ?? ""),
    dueDate: s((invoice as any).due_date ?? ""),
    currency: s((invoice as any).currency ?? "TND"),
    supplier: {
      name: s((company as any).company_name ?? ""),
      taxId: s((company as any).tax_id ?? ""),
      address: s((company as any).address ?? ""),
      street: s((company as any).street ?? ""),
      city: s((company as any).city ?? ""),
      postalCode: s((company as any).postal_code ?? ""),
      country: s((company as any).country ?? "TN"),
    },
    customer: {
      name: s((invoice as any).customer_name ?? ""),
      taxId: ((invoice as any).customer_tax_id ?? null) as string | null,
      address: s((invoice as any).customer_address ?? ""),
      city: s((invoice as any).customer_city ?? ""),
      postalCode: s((invoice as any).customer_postal_code ?? ""),
      country: s((invoice as any).customer_country ?? "TN"),
    },
    totals: {
      ht: Number((invoice as any).subtotal_ht ?? 0),
      tva: Number((invoice as any).total_vat ?? 0),
      ttc: Number((invoice as any).total_ttc ?? 0),
      stampEnabled: Boolean((invoice as any).stamp_enabled ?? false),
      stampAmount: Number((invoice as any).stamp_amount ?? 0),
    },
    notes: s((invoice as any).notes ?? ""),
    purpose: purpose as any,
    items: (items ?? []).map((it: any) => ({
      description: s(it.description ?? ""),
      qty: Number(it.quantity ?? 0),
      price: Number(it.unit_price_ht ?? 0),
      vat: Number(it.vat_pct ?? 0),
      discount: Number(it.discount_pct ?? 0),
    })),
  });

  const problems = validateTeifMinimum(teifXml);
  if (problems.length) {
    return NextResponse.json({ ok: false, error: "TEIF_INVALID", details: problems }, { status: 400 });
  }

  const sized = enforceMaxSize(teifXml);
  const xml = sized.xml;

  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="invoice_${invoiceId}.xml"`,
      "cache-control": "no-store",
    },
  });
}
