import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildCompactTeifXml,
  validateTeifMinimum,
  enforceMaxSize,
} from "@/lib/ttn/teif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function GET(req: Request) {
  const supabase = createServiceClient();
  const url = new URL(req.url);
  const token = s(url.searchParams.get("token"));
  if (!token) {
    return NextResponse.json({ ok: false, error: "TOKEN_MISSING" }, { status: 400 });
  }

  const { data: t, error: tErr } = await supabase
    .from("signature_sign_tokens")
    .select("id, token, invoice_id, company_id, environment, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (tErr || !t) return NextResponse.json({ ok: false, error: "INVALID_TOKEN" }, { status: 400 });
  if (t.used_at) return NextResponse.json({ ok: false, error: "TOKEN_ALREADY_USED" }, { status: 400 });
  if (new Date(String(t.expires_at)).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "TOKEN_EXPIRED" }, { status: 400 });
  }

  const invoiceId = String(t.invoice_id);
  const companyId = String(t.company_id);
  const environment = (String(t.environment) || "production") as "test" | "production";

  const [{ data: invoice, error: invErr }, { data: items, error: itemsErr }, { data: company, error: cErr }] =
    await Promise.all([
      supabase.from("invoices").select("*").eq("id", invoiceId).single(),
      supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("line_no", { ascending: true }),
      supabase.from("companies").select("*").eq("id", companyId).single(),
    ]);

  if (invErr || !invoice) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
  if (itemsErr) return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
  if (cErr || !company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 500 });

  // Charger thumbprint si société associée à une clé
  const { data: cred } = await supabase
    .from("ttn_credentials")
    .select("signature_provider, signature_status, signature_config")
    .eq("company_id", companyId)
    .eq("environment", environment)
    .maybeSingle();

  const thumbprint = (cred as any)?.signature_config?.usb_agent?.thumbprint ?? null;

  const teifXml = buildCompactTeifXml({
    invoiceId: String((invoice as any).id),
    companyId: String((company as any).id),
    documentType: String((invoice as any).document_type ?? "facture"),
    invoiceNumber: String((invoice as any).invoice_number ?? ""),
    issueDate: String((invoice as any).issue_date ?? (invoice as any).created_at ?? ""),
    dueDate: String((invoice as any).due_date ?? ""),
    currency: String((invoice as any).currency ?? "TND"),
    supplier: {
      name: String((company as any).company_name ?? ""),
      taxId: String((company as any).tax_id ?? ""),
      address: String((company as any).address ?? ""),
      city: String((company as any).city ?? ""),
      postalCode: String((company as any).postal_code ?? ""),
      country: String((company as any).country ?? "TN"),
    },
    customer: {
      name: String((invoice as any).customer_name ?? ""),
      taxId: ((invoice as any).customer_tax_id ?? null) as string | null,
      address: String((invoice as any).customer_address ?? ""),
      city: String((invoice as any).customer_city ?? ""),
      postalCode: String((invoice as any).customer_postal_code ?? ""),
      country: String((invoice as any).customer_country ?? "TN"),
    },
    totals: {
      ht: Number((invoice as any).total_ht ?? (invoice as any).subtotal_ht ?? 0),
      tva: Number((invoice as any).total_tva ?? (invoice as any).total_vat ?? 0),
      ttc: Number((invoice as any).total_ttc ?? (invoice as any).total ?? 0),
      stampEnabled: Boolean((invoice as any).stamp_enabled ?? false),
      stampAmount: Number((invoice as any).stamp_amount ?? 0),
    },
    notes: String((invoice as any).notes ?? ""),
    items: (items ?? []).map((it: any) => ({
      description: String(it.description ?? it.label ?? ""),
      qty: Number(it.qty ?? it.quantity ?? 1),
      price: Number(it.price ?? it.unit_price ?? it.unit_price_ht ?? 0),
      vat: Number(it.vat ?? it.vat_pct ?? 0),
      discount: Number(it.discount ?? it.discount_pct ?? 0),
    })),
  });

  const problems = validateTeifMinimum(teifXml);
  if (problems.length) {
    return NextResponse.json({ ok: false, error: "TEIF_INVALID", details: problems }, { status: 400 });
  }

  const sized = enforceMaxSize(teifXml);
  const xml = sized.xml;

  return NextResponse.json({ ok: true, invoice_id: invoiceId, company_id: companyId, environment, thumbprint, xml });
}
