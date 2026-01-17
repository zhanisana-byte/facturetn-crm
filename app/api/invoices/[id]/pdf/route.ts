import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PDF generation serverless-safe (Vercel)
 * - No PDFKit (no Helvetica.afm filesystem dependency)
 * - Uses pdf-lib (fonts embedded via StandardFonts)
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id  } = await ctx.params;
    const supabase = await createClient();

    // Auth
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Load invoice + items + company
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

    // Create PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 points
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Layout helpers
    const margin = 40;
    let y = height - margin;

    const drawText = (text: string, x: number, size = 11, bold = false) => {
      page.drawText(text, {
        x,
        y,
        size,
        font: bold ? fontBold : font,
        color: rgb(0.08, 0.1, 0.12),
      });
      y -= size + 4;
    };

    const safe = (v: any) => (v == null ? "" : String(v));

    // Header
    drawText("FACTURE", margin, 18, true);
    drawText(
      `N°: ${safe(
        (invoice as any).invoice_number ||
          (invoice as any).unique_reference ||
          (invoice as any).id
      ).slice(0, 40)}`,
      margin,
      11,
      true
    );
    drawText(`Date: ${safe((invoice as any).issue_date)}`, margin, 11, false);
    y -= 6;

    // Company block (left) + Customer block (right)
    const leftX = margin;
    const rightX = width / 2 + 10;

    const blockTopY = y;

    // Company
    y = blockTopY;
    drawText(safe(company?.company_name || "Société"), leftX, 12, true);
    if (company?.tax_id) drawText(`MF: ${safe(company.tax_id)}`, leftX, 10, false);
    if (company?.address) drawText(safe(company.address), leftX, 10, false);
    if (company?.phone) drawText(`Tél: ${safe(company.phone)}`, leftX, 10, false);
    if (company?.email) drawText(`Email: ${safe(company.email)}`, leftX, 10, false);

    // Customer
    y = blockTopY;
    drawText("Client", rightX, 12, true);
    drawText(safe((invoice as any).customer_name || ""), rightX, 10, false);
    if ((invoice as any).customer_tax_id)
      drawText(`MF: ${safe((invoice as any).customer_tax_id)}`, rightX, 10, false);
    if ((invoice as any).customer_address)
      drawText(safe((invoice as any).customer_address), rightX, 10, false);
    if ((invoice as any).customer_phone)
      drawText(`Tél: ${safe((invoice as any).customer_phone)}`, rightX, 10, false);
    if ((invoice as any).customer_email)
      drawText(`Email: ${safe((invoice as any).customer_email)}`, rightX, 10, false);

    // Move cursor below blocks
    y = Math.min(y, blockTopY - 85);
    y -= 10;

    // Table header
    const tableX = margin;
    const colDesc = tableX;
    const colQty = tableX + 290;
    const colPU = tableX + 350;
    const colTVA = tableX + 430;
    const colTTC = tableX + 500;

    const lineH = 16;

    const drawLine = () => {
      page.drawLine({
        start: { x: margin, y: y + 6 },
        end: { x: width - margin, y: y + 6 },
        thickness: 1,
        color: rgb(0.86, 0.87, 0.89),
      });
    };

    // Header row
    page.drawText("Description", { x: colDesc, y, size: 10, font: fontBold, color: rgb(0.08, 0.1, 0.12) });
    page.drawText("Qté", { x: colQty, y, size: 10, font: fontBold, color: rgb(0.08, 0.1, 0.12) });
    page.drawText("PU HT", { x: colPU, y, size: 10, font: fontBold, color: rgb(0.08, 0.1, 0.12) });
    page.drawText("TVA%", { x: colTVA, y, size: 10, font: fontBold, color: rgb(0.08, 0.1, 0.12) });
    page.drawText("TTC", { x: colTTC, y, size: 10, font: fontBold, color: rgb(0.08, 0.1, 0.12) });
    y -= lineH;
    drawLine();
    y -= 6;

    const fmt = (n: any) => {
      const v = Number(n || 0);
      return v.toFixed(3);
    };

    const rows = (items || []) as any[];

    for (const it of rows) {
      if (y < 140) break;

      const desc = safe(it.description || "").slice(0, 55);
      page.drawText(desc, { x: colDesc, y, size: 10, font, color: rgb(0.08, 0.1, 0.12) });
      page.drawText(fmt(it.quantity), { x: colQty, y, size: 10, font, color: rgb(0.08, 0.1, 0.12) });
      page.drawText(fmt(it.unit_price_ht), { x: colPU, y, size: 10, font, color: rgb(0.08, 0.1, 0.12) });
      page.drawText(fmt(it.vat_pct), { x: colTVA, y, size: 10, font, color: rgb(0.08, 0.1, 0.12) });
      page.drawText(fmt(it.line_total_ttc), { x: colTTC, y, size: 10, font, color: rgb(0.08, 0.1, 0.12) });
      y -= lineH;
    }

    y -= 8;
    drawLine();
    y -= 18;

    // Totals (right)
    const totalsX = width - margin - 210;

    const drawTotal = (label: string, value: string, bold = false) => {
      page.drawText(label, { x: totalsX, y, size: 10, font: bold ? fontBold : font, color: rgb(0.08, 0.1, 0.12) });
      page.drawText(value, { x: totalsX + 130, y, size: 10, font: bold ? fontBold : font, color: rgb(0.08, 0.1, 0.12) });
      y -= 14;
    };

    drawTotal("Total HT", fmt((invoice as any).subtotal_ht), false);
    drawTotal("Total TVA", fmt((invoice as any).total_vat), false);

    if ((invoice as any).stamp_enabled) {
      drawTotal("Timbre", fmt((invoice as any).stamp_amount), false);
    }

    drawTotal("Total TTC", fmt((invoice as any).total_ttc ?? (invoice as any).total), true);

    y -= 10;

    // Notes / legal
    const legalY = 90;
    page.drawLine({
      start: { x: margin, y: legalY + 35 },
      end: { x: width - margin, y: legalY + 35 },
      thickness: 1,
      color: rgb(0.86, 0.87, 0.89),
    });

    page.drawText(
      "Document généré par FactureTN. Le document TEIF/XML fait foi pour la soumission TTN.",
      { x: margin, y: legalY + 18, size: 9, font, color: rgb(0.35, 0.38, 0.42) }
    );

    if ((invoice as any).qr_payload) {
      page.drawText("QR: " + safe((invoice as any).qr_payload).slice(0, 80), {
        x: margin,
        y: legalY,
        size: 8,
        font,
        color: rgb(0.35, 0.38, 0.42),
      });
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `facture-${safe((invoice as any).invoice_number || id)}.pdf`;

    // ✅ FIX Next 15 typing: BodyInit doesn't accept Uint8Array
    const body =
      pdfBytes instanceof Uint8Array
        ? pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength)
        : (pdfBytes as any);

    return new NextResponse(body as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
