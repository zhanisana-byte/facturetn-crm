import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id  } = await ctx.params;
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
      return NextResponse.json(
        { ok: false, error: invErr?.message || "Not found" },
        { status: 404 }
      );
    }

  const docType = String((invoice as any).document_type ?? 'facture').toLowerCase();
  const docTitle = docType === 'devis' ? 'DEVIS' : docType === 'avoir' ? 'AVOIR' : 'FACTURE';

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

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); 
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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

    const toNum = (v: any) => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const buildTeifQrPayload = () => {
      const inv: any = invoice as any;
      const co: any = company as any;
      const invNumber = safe(inv.invoice_number || inv.unique_reference || inv.id).slice(0, 60);
      const issueDate = safe(inv.issue_date);
      const currency = safe(inv.currency || "TND");

      const seller = {
        name: safe(co?.company_name || ""),
        mf: safe(co?.tax_id || ""),
        address: safe(co?.address || ""),
      };

      const buyer = {
        name: safe(inv.customer_name || ""),
        mf: safe(inv.customer_tax_id || ""),
        address: safe(inv.customer_address || ""),
      };

      const linesArr = (Array.isArray(items) ? items : []).map((it: any) => ({
        no: toNum(it.line_no),
        desc: safe(it.description || it.name || ""),
        qty: toNum(it.quantity),
        pu_ht: toNum(it.unit_price),
        vat_pct: toNum(it.vat),
        line_ht: toNum(it.total_ht ?? it.line_total_ht ?? it.total ?? (toNum(it.quantity) * toNum(it.unit_price))),
      }));

      const subtotal_ht = toNum(inv.subtotal_ht);
      const total_vat = toNum(inv.total_vat);
      const stamp_enabled = Boolean(inv.stamp_enabled);
      const stamp_amount = toNum(inv.stamp_amount);
      const total_ttc = toNum(inv.total_ttc);

      const payloadObj = {
        spec: "TEIF-QR",
        version: "1.0",
        invoice: { number: invNumber, date: issueDate, currency },
        seller,
        buyer,
        totals: {
          subtotal_ht,
          total_vat,
          stamp_enabled,
          stamp_amount,
          total_ttc,
        },
        lines: linesArr,
      };

      const payloadJson = JSON.stringify(payloadObj);
      const hash = crypto.createHash("sha256").update(payloadJson, "utf8").digest("hex");

      const ttnRef = safe(inv.ttn_reference || "");
      const ttnSt = safe(inv.ttn_status || "");

      const payload = (ttnRef && String(ttnSt).toLowerCase() === "accepted")
        ? `TTNQR|REF:${ttnRef}`
        : `TEIFQR|${payloadJson}|SHA256:${hash}`;
      return { payload, hash, ref: invNumber };
    };

    try {
      const { payload, hash, ref } = buildTeifQrPayload();
      const dataUrl = await QRCode.toDataURL(payload, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 180,
      });

      const base64 = dataUrl.split(",")[1] || "";
      const pngBytes = Buffer.from(base64, "base64");
      const qrImage = await pdfDoc.embedPng(pngBytes);

      const qrSize = 90;
      const qrX = width - margin - qrSize;
      const qrY = height - margin - qrSize;
      page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

      const hashShort = safe(hash).slice(0, 16);
      page.drawText(`Ref: ${safe(ref).slice(0, 28)}`, {
        x: qrX,
        y: qrY - 12,
        size: 8,
        font,
        color: rgb(0.35, 0.38, 0.42),
      });
      page.drawText(`SHA256: ${hashShort}…`, {
        x: qrX,
        y: qrY - 24,
        size: 8,
        font,
        color: rgb(0.35, 0.38, 0.42),
      });
    } catch {
      
    }

    drawText(docTitle, margin, 18, true);
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

    const leftX = margin;
    const rightX = width / 2 + 10;

    const blockTopY = y;

    y = blockTopY;
    drawText(safe(company?.company_name || "Société"), leftX, 12, true);
    if (company?.tax_id) drawText(`MF: ${safe(company.tax_id)}`, leftX, 10, false);
    if (company?.address) drawText(safe(company.address), leftX, 10, false);
    const cityLine = [company?.postal_code, company?.city, company?.country].filter(Boolean).join(" ");
    if (cityLine) drawText(cityLine, leftX, 10, false);
    if (company?.phone) drawText(`Tél: ${safe(company.phone)}`, leftX, 10, false);
    if (company?.email) drawText(`Email: ${safe(company.email)}`, leftX, 10, false);

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

    y = Math.min(y, blockTopY - 85);
    y -= 10;

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

    const pdfBytes = await pdfDoc.save();
    const filename = `facture-${safe((invoice as any).invoice_number || id)}.pdf`;

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
