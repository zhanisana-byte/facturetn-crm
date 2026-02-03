import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTeifInvoiceXml } from "@/lib/ttn/teifXml";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function clampPct(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}

function computeFromItems(items: any[]) {
  let ht = 0;
  let tva = 0;

  for (const it of items) {
    const qty = n(it.quantity ?? it.qty ?? 0);
    const pu = n(it.unit_price_ht ?? it.unit_price ?? it.price ?? 0);
    const vatPct = n(it.vat_pct ?? it.vatPct ?? it.tva_pct ?? it.tvaPct ?? it.vat ?? 0);

    const discPct = clampPct(n(it.discount_pct ?? it.discountPct ?? it.remise_pct ?? it.remisePct ?? it.discount ?? 0));
    const discAmt = n(it.discount_amount ?? it.discountAmount ?? it.remise_amount ?? it.remiseAmount ?? 0);

    const base = qty * pu;
    const remise = discAmt > 0 ? discAmt : discPct > 0 ? (base * discPct) / 100 : 0;
    const lineHt = Math.max(0, base - remise);
    const lineTva = (lineHt * vatPct) / 100;

    ht += lineHt;
    tva += lineTva;
  }

  return { ht, tva };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const invoiceId = s(body?.invoiceId || body?.invoice_id || "");
  if (!invoiceId) return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });

  const { data: invoice, error: eInv } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
  if (eInv || !invoice) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const companyId = s((invoice as any).company_id || "");
  const { data: company, error: eC } = await supabase.from("companies").select("*").eq("id", companyId).single();
  if (eC || !company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const { data: items, error: eItems } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  if (eItems) return NextResponse.json({ ok: false, error: "ITEMS_READ_FAILED" }, { status: 500 });

  const invNo = s((invoice as any)?.invoice_number ?? (invoice as any)?.invoice_no ?? "");
  const number = invNo || `INV-${invoiceId.slice(0, 8)}`;

  const issueDate = s((invoice as any)?.issue_date ?? "");
  const dueDate = s((invoice as any)?.due_date ?? "");
  const currency = s((invoice as any)?.currency ?? "TND");
  const docType = s((invoice as any)?.document_type ?? "facture");

  const stampRaw = (invoice as any)?.stamp_amount ?? (invoice as any)?.stamp_duty;
  const stampAmount = stampRaw == null ? 1 : n(stampRaw);

  const computed = computeFromItems(items ?? []);
  const ht = computed.ht;
  const tva = computed.tva;
  const ttc = ht + tva + stampAmount;

  const teifXml = buildTeifInvoiceXml({
    invoiceId,
    company: {
      name: s((company as any)?.company_name ?? ""),
      taxId: s((company as any)?.tax_id ?? (company as any)?.taxId ?? ""),
      address: s((company as any)?.address ?? ""),
      city: s((company as any)?.city ?? ""),
      postalCode: s((company as any)?.postal_code ?? (company as any)?.zip ?? ""),
      country: s((company as any)?.country ?? "TN"),
    },
    invoice: {
      documentType: docType,
      number,
      issueDate,
      dueDate,
      currency,
      customerName: s((invoice as any)?.customer_name ?? ""),
      customerTaxId: s((invoice as any)?.customer_tax_id ?? ""),
      customerEmail: s((invoice as any)?.customer_email ?? ""),
      customerPhone: s((invoice as any)?.customer_phone ?? ""),
      customerAddress: s((invoice as any)?.customer_address ?? ""),
      notes: s((invoice as any)?.notes ?? ""),
    },
    totals: {
      ht,
      tva,
      ttc,
      stampEnabled: true,
      stampAmount,
    },
    items: (items ?? []).map((it: any) => ({
      description: s(it.description ?? ""),
      qty: n(it.quantity ?? 1),
      price: n(it.unit_price_ht ?? 0),
      vat: n(it.vat_pct ?? 0),
      discount: n(it.discount_pct ?? 0),
    })),
    purpose: "ttn",
  });

  return NextResponse.json({ ok: true, invoiceId, teifXml }, { status: 200 });
}
