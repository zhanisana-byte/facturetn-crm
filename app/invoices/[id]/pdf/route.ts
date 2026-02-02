import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function money(n: number, currency: string) {
  return `${round3(n).toFixed(3)} ${currency}`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (invErr || !invoice) {
      return NextResponse.json({ ok: false, error: invErr?.message || "NOT_FOUND" }, { status: 404 });
    }

    const companyId = s((invoice as any).company_id);
    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();

    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .order("line_no", { ascending: true });

    const docTypeRaw = s((invoice as any)?.document_type || "facture").toLowerCase();
    const docType = docTypeRaw === "devis" ? "DEVIS" : docTypeRaw === "avoir" ? "AVOIR" : "FACTURE";

    const issueDate = s((invoice as any)?.issue_date || (invoice as any)?.created_at || "").slice(0, 10);
    const invoiceNumber = s((invoice as any)?.invoice_number || (invoice as any)?.invoice_no || "");
    const currency = s((invoice as any)?.currency || "TND");

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
    const sellerPhone = s((company as any)?.phone ?? (invoice as any)?.seller_phone);
    const sellerEmail = s((company as any)?.email ?? (invoice as any)?.seller_email);

    const customerName = s((invoice as any)?.customer_name ?? "");
    const customerMf = s((invoice as any)?.customer_tax_id ?? "");
    const customerAddress = s((invoice as any)?.customer_address ?? "");
    const customerPhone = s((invoice as any)?.customer_phone ?? "");
    const customerEmail = s((invoice as any)?.customer_email ?? "");

    const stampEnabled = Boolean((invoice as any)?.stamp_enabled ?? true);
    const stampAmount = round3(toNum((invoice as any)?.stamp_amount ?? 1));

    const subtotalHt = round3(
      toNum((invoice as any)?.subtotal_ht ?? (invoice as any)?.total_ht ?? 0)
    );
    const totalVat = round3(
      toNum((invoice as any)?.total_vat ?? (invoice as any)?.total_tax ?? 0)
    );

    const computedFromLines = Array.isArray(items) ? items : [];
    let linesHT = 0;
    let linesVAT = 0;

    for (const it of computedFromLines) {
      const qty = toNum((it as any)?.quantity);
      const pu = toNum((it as any)?.unit_price_ht ?? (it as any)?.unit_price);
      const vatPct = toNum((it as any)?.vat_pct ?? (it as any)?.vat);
      const ht = round3(toNum((it as any)?.line_total_ht ?? qty * pu));
      const vatAmt = round3(ht * (vatPct / 100));
      linesHT = round3(linesHT + ht);
      linesVAT = round3(linesVAT + vatAmt);
    }

    const finalHT = subtotalHt > 0 ? subtotalHt : linesHT;
    const finalVAT = totalVat > 0 ? totalVat : linesVAT;

    const totalTtcFromInvoice = (invoice as any)?.total_ttc != null ? toNum((invoice as any)?.total_ttc) : 0;
    const finalTTC = round3(
      totalTtcFromInvoice > 0
        ? totalTtcFromInvoice
        : finalHT + finalVAT + (stampEnabled ? stampAmount : 0)
    );

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const margin = 36;

    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);

    const drawText = (
      p: PDFPage,
      text: string,
      x: number,
      y: number,
      size = 10,
      bold = false,
      color = rgb(0, 0, 0)
    ) => {
      p.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
    };

    const drawLine = (p: PDFPage, x1: number, y1: number, x2: number, y2: number) => {
      p.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        thickness: 1,
        color: rgb(0.87, 0.87, 0.87),
      });
    };

    const headerY = PAGE_H - margin - 10;
    drawText(page, docType, margin, headerY, 18, true);
    if (invoiceNumber) drawText(page, `N° ${invoiceNumber}`, margin, headerY - 22, 11, false);
    drawText(page, `Date: ${issueDate || "-"}`, PAGE_W - margin - 160, headerY - 6, 10, false);

    drawLine(page, margin, headerY - 34, PAGE_W - margin, headerY - 34);

    let y = headerY - 60;

    drawText(page, "Vendeur", margin, y, 11, true);
    drawText(page, sellerName || "-", margin, y - 14, 10, false);
    if (sellerMf) drawText(page, `MF: ${sellerMf}`, margin, y - 28, 10, false);
    if (sellerAddress) drawText(page, sellerAddress, margin, y - 42, 10, false);
    const sellerCityLine = [sellerZip, sellerCity, sellerCountry].filter(Boolean).join(" ");
    if (sellerCityLine) drawText(page, sellerCityLine, margin, y - 56, 10, false);
    if (sellerPhone) drawText(page, `Tél: ${sellerPhone}`, margin, y - 70, 10, false);
    if (sellerEmail) drawText(page, `Email: ${sellerEmail}`, margin, y - 84, 10, false);

    const rightX = PAGE_W / 2 + 10;
    drawText(page, "Client", rightX, y, 11, true);
    drawText(page, customerName || "-", rightX, y - 14, 10, false);
    if (customerMf) drawText(page, `MF: ${customerMf}`, rightX, y - 28, 10, false);
    if (customerAddress) drawText(page, customerAddress, rightX, y - 42, 10, false);
    if (customerPhone) drawText(page, `Tél: ${customerPhone}`, rightX, y - 56, 10, false);
    if (customerEmail) drawText(page, `Email: ${customerEmail}`, rightX, y - 70, 10, false);

    y -= 110;
    drawLine(page, margin, y, PAGE_W - margin, y);
    y -= 18;

    drawText(page, "Description", margin, y, 10, true);
    drawText(page, "Qté", PAGE_W - margin - 210, y, 10, true);
    drawText(page, "PU HT", PAGE_W - margin - 160, y, 10, true);
    drawText(page, "TVA%", PAGE_W - margin - 105, y, 10, true);
    drawText(page, "Total TTC", PAGE_W - margin - 65, y, 10, true);

    y -= 10;
    drawLine(page, margin, y, PAGE_W - margin, y);
    y -= 16;

    const rows = Array.isArray(items) ? items : [];
    for (const it of rows) {
      if (y < margin + 160) break;

      const desc = s((it as any)?.description || "").slice(0, 75);
      const qty = round3(toNum((it as any)?.quantity));
      const pu = round3(toNum((it as any)?.unit_price_ht ?? (it as any)?.unit_price));
      const vatPct = round3(toNum((it as any)?.vat_pct ?? (it as any)?.vat));
      const ht = round3(toNum((it as any)?.line_total_ht ?? qty * pu));
      const vatAmt = round3(ht * (vatPct / 100));
      const ttc = round3(ht + vatAmt);

      drawText(page, desc || "-", margin, y, 10, false);
      drawText(page, String(qty), PAGE_W - margin - 210, y, 10, false);
      drawText(page, pu.toFixed(3), PAGE_W - margin - 160, y, 10, false);
      drawText(page, String(vatPct), PAGE_W - margin - 105, y, 10, false);
      drawText(page, ttc.toFixed(3), PAGE_W - margin - 65, y, 10, false);

      y -= 16;
    }

    y -= 6;
    drawLine(page, margin, y, PAGE_W - margin, y);
    y -= 18;

    const drawTotalRow = (label: string, value: string, yy: number) => {
      drawText(page, label, PAGE_W - margin - 220, yy, 10, false);
      drawText(page, value, PAGE_W - margin - 65, yy, 10, true);
    };

    drawTotalRow("Total HT", money(finalHT, currency), y);
    y -= 14;
    drawTotalRow("Total TVA", money(finalVAT, currency), y);
    y -= 14;
    if (stampEnabled) {
      drawTotalRow("Timbre", money(stampAmount, currency), y);
      y -= 14;
    }
    drawTotalRow("Total TTC", money(finalTTC, currency), y);

    const qrPayload = {
      invoice_id: String((invoice as any)?.id),
      company_id: String((invoice as any)?.company_id),
      issue_date: issueDate,
      total_ttc: finalTTC,
      currency,
      hash: crypto
        .createHash("sha256")
        .update(`${(invoice as any)?.id}|${issueDate}|${finalTTC}|${currency}`)
        .digest("hex"),
    };

    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));
    const b64 = (qrDataUrl.split(",")[1] || "").trim();
    if (b64) {
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const img = await pdfDoc.embedPng(bytes);
      const size = 90;
      page.drawImage(img, { x: margin, y: margin + 10, width: size, height: size });
      drawText(page, "QR", margin + 34, margin + 2, 9, true, rgb(0.35, 0.35, 0.35));
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${docType}-${invoiceNumber || id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "PDF_ERROR" }, { status: 500 });
  }
}
