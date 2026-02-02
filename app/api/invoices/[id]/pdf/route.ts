import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: unknown) {
  return String(v ?? "").trim();
}
function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function fmt3(v: number) {
  return v.toFixed(3);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*,ttn_reference,ttn_status")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ ok: false, error: invErr?.message || "Not found" }, { status: 404 });
    }

    const docType = String((invoice as any).document_type ?? "facture").toLowerCase();
    const docTitle = docType === "devis" ? "DEVIS" : docType === "avoir" ? "AVOIR" : "FACTURE";

    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .order("line_no", { ascending: true });

    const companyId = s((invoice as any).company_id);
    const { data: company } = await supabase.from("companies").select("*").eq("id", companyId).maybeSingle();

    const sellerName = s((company as any)?.company_name ?? (company as any)?.name ?? (invoice as any)?.seller_name ?? "");
    const sellerMf = s((company as any)?.tax_id ?? (invoice as any)?.seller_tax_id ?? "");
    const sellerAddress =
      s((company as any)?.address) ||
      s((company as any)?.address_line) ||
      s((company as any)?.street) ||
      s((invoice as any)?.seller_street);

    const sellerCity = s((company as any)?.city ?? (invoice as any)?.seller_city);
    const sellerZip = s((company as any)?.postal_code ?? (company as any)?.zip ?? (invoice as any)?.seller_zip);
    const sellerCountry = s((company as any)?.country ?? "TN");

    const customerName = s((invoice as any)?.customer_name ?? "");
