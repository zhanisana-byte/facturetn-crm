import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      .select("*")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ ok: false, error: invErr?.message || "Not found" }, { status: 404 });
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

    const safe = (v: any) => String(v ?? "").trim();
    const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const round3 = (n: number) => Math.round(n * 1000) / 1000;

    const docTypeRaw = safe((invoice as any).document_type || "facture");
    const docType =
      docTypeRaw.toLowerCase() === "devis"
        ? "DEVIS"
        : docTypeRaw.toLowerCase() === "avoir"
          ? "AVOIR"
          : "FACTURE";

    const invNumber = safe((invoice as any).invoice_number || (invoice as any).invoice_no || "");
    const issueDate =
      safe((invoice as any).issue_date || "").slice(0, 10) ||
      safe((invoice as any).created_at).slice(0, 10);

    const dueDate = safe((invoice as any).due_date || "").slice(0, 10);
    const currency = safe((invoice as any).currency || "TND");

    const sellerName = safe(company?.company_name || "Société");
    const sellerMF = safe((company as any)?.tax_id || "");
    const sellerAdr = safe((company as any)?.address || "");
    const sellerCity = [(company as any)?.postal_code, (company as any)?.city, (company as any)?.country].filter(Boolean).join(" ");
    const sellerTel = safe((company as any)?.phone || "");
    const sellerEmail = safe((company as any)?.email || "");

    const buyerName = safe((invoice as any).customer_name || "");
    const buyerMF = safe((invoice as any).customer_tax_id || "");
    const buyerAdr = safe((invoice as any).customer_address || "");
    const buyerTel = safe((invoice as any).customer_phone || "");
    const buyerEmail = safe((invoice as any).customer_email || "");
    const dest = safe((invoice as any).destination || "");

    const inv_subtotal_ht = round3(toNum((invoice as any).total_ht ?? (invoice as any).subtotal_ht));
    const inv_total_vat = round3(toNum((invoice as any).total_vat ?? (invoice as any).total_tax));
    const stamp_enabled = Boolean((invoice as any).stamp_enabled);
    const stamp_amount = round3(toNum((invoice as any).stamp_amount));
    const inv_total_ttc = round3(
      toNum(
        (invoice as any).total_ttc ??
          (inv_subtotal_ht + inv_total_vat + (stamp_enabled ? stamp_amount : 0))
      )
    );

    const arr = Array.isArray(items) ? items : [];
    let calcHT = 0;
    let calcVAT = 0;
    let calcTTC = 0;

    for (const it of arr) {
      const qty = toNum((it as any).quantity);
      const pu = toNum((it as any).unit_price_ht ?? (it as any).unit_price);
      const vatPct = toNum((it as any).vat_pct ?? (it as any).vat);
      const ht = round3(toNum((it as any).line_total_ht ?? (qty * pu)));
      const vatAmt = round3(ht * (vatPct / 100));
      const ttc = round3(ht + vatAmt);

      calcHT = round3(calcHT + ht);
      calcVAT = round3(calcVAT + vatAmt);
      calcTTC = round3(calcTTC + ttc);
    }

    const subtotal_ht = inv_subtotal_ht > 0 ? inv_subtotal_ht : calcHT;
    const total_vat = inv_total_vat > 0 ? inv_total_vat : calcVAT;
    const total_ttc =
      (invoice as any).total_ttc != null
        ? inv_total_ttc
        : round3(calcTTC + (stamp_enabled ? stamp_amount : 0));

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;

    const margin = 36;

    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const drawText = (p: PDFPage, text: string, x: number, y: number, size = 10, bold = false, color = rgb(0, 0, 0)) => {
      p.drawText(text, { x, y, size, font: bold ? fontBold : font, color });
    };

    const line = (p: PDFPage, x1: number, y1: number, x2: number, y2: number) => {
      p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    };

    const headerY = PAGE_H - margin - 10;
    drawText(page, docType, margin, headerY, 18, true);
    if (invNumber) drawText(page, `N° ${invNumber}`, margin, headerY - 22, 11, false);
    drawText(page, `Date: ${issueDate}`, PAGE_W - margin - 160, headerY - 6, 10, false);
    if (dueDate) drawText(page, `Échéance: ${dueDate}`, PAGE_W - margin - 160, headerY - 20, 10, false);

    line(page, margin, headerY - 34, PAGE_W - margin, headerY - 34);

    let y = headerY - 60;

    drawText(page, "Vendeur", margin, y, 11, true);
    drawText(page, sellerName, margin, y - 14, 10, false);
    if (sellerMF) drawText(page, `MF: ${sellerMF}`, margin, y - 28, 10, false);
    if (sellerAdr) drawText(page, sellerAdr, margin, y - 42, 10, false);
    if (sellerCity) drawText(page, sellerCity, margin, y - 56, 10, false);
    if (sellerTel) drawText(page, `Tél: ${sellerTel}`, margin, y - 70, 10, false);
    if (sellerEmail) drawText(page, `Email: ${sellerEmail}`, margin, y - 84, 10, false);

    const rightX = PAGE_W / 2 + 10;
    drawText(page, "Client", rightX, y, 11, true);
    drawText(page, buyerName || "-", rightX, y - 14, 10, false);
    if (buyerMF) drawText(page, `MF: ${buyerMF}`, rightX, y - 28, 10, false);
    if (buyerAdr) drawText(page, buyerAdr, rightX, y - 42, 10, false);
    if (buyerTel) drawText(page, `Tél: ${buyerTel}`, rightX, y - 56, 10, false);
    if (buyerEmail) drawText(page, `Email: ${buyerEmail}`, rightX, y - 70, 10, false);
    if (dest) drawText(page, `Destination: ${dest}`, rightX, y - 84, 10, false);

    y -= 110;
    line(page, margin, y, PAGE_W - margin, y);
    y -= 18;

    drawText(page, "Description", margin, y, 10, true);
    drawText(page, "Qté", PAGE_W - margin - 210, y, 10, true);
    drawText(page, "PU HT", PAGE_W - margin - 160, y, 10, true);
    drawText(page, "TVA%", PAGE_W - margin - 105, y, 10, true);
    drawText(page, "Total TTC", PAGE_W - margin - 55, y, 10, true);

    y -= 10;
    line(page, margin, y, PAGE_W - margin, y);
    y -= 16;

    const fmtMoney = (v: number) => `${round3(v).toFixed(3)} ${currency}`;

    for (const it of arr) {
      const desc = safe((it as any).description || "");
      const qty = round3(toNum((it as any).quantity));
      const pu = round3(toNum((it as any).unit_price_ht ?? (it as any).unit_price));
      const vatPct = round3(toNum((it as any).vat_pct ?? (it as any).vat));
      const ht = round3(toNum((it as any).line_total_ht ?? (qty * pu)));
      const vatAmt = round3(ht * (vatPct / 100));
      const ttc = round3(ht + vatAmt);

      if (y < margin + 140) break;

      drawText(page, desc.slice(0, 70), margin, y, 10, false);
      drawText(page, String(qty), PAGE_W - margin - 210, y, 10, false);
      drawText(page, round3(pu).toFixed(3), PAGE_W - margin - 160, y, 10, false);
      drawText(page, String(vatPct), PAGE_W - margin - 105, y, 10, false);
      drawText(page, round3(ttc).toFixed(3), PAGE_W - margin - 55, y, 10, false);

      y -= 16;
    }

    y -= 6;
    line(page, margin, y, PAGE_W - margin, y);
    y -= 18;

    const tRow = (label: string, value: string, yy: number) => {
      drawText(page, label, PAGE_W - margin - 220, yy, 10, false);
      drawText(page, value, PAGE_W - margin - 55, yy, 10, true);
    };

    tRow("Total HT", fmtMoney(subtotal_ht), y);
    y -= 14;
    tRow("Total TVA", fmtMoney(total_vat), y);
    y -= 14;
    if (stamp_enabled) {
      tRow("Timbre", fmtMoney(stamp_amount), y);
      y -= 14;
    }
    tRow("Total TTC", fmtMoney(total_ttc), y);

    const qrPayload = {
      id: String((invoice as any).id),
      company_id: String((invoice as any).company_id),
      issue_date: issueDate,
      total_ttc: total_ttc,
      currency: currency,
      hash: crypto.createHash("sha256").update(`${(invoice as any).id}|${issueDate}|${total_ttc}|${currency}`).digest("hex"),
    };

    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(qrPayload));
    const qrBase64 = qrDataUrl.split(",")[1] || "";
    const qrBytes = Uint8Array.from(Buffer.from(qrBase64, "base64"));
    const qrImage = await pdfDoc.embedPng(qrBytes);

    const qrSize = 90;
    page.drawImage(qrImage, { x: margin, y: margin + 10, width: qrSize, height: qrSize });
    drawText(page, "QR", margin + 32, margin + 2, 9, true, rgb(0.3, 0.3, 0.3));

    const pdfBytes = await pdfDoc.save();
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${docType}-${invNumber || id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "PDF_ERROR" }, { status: 500 });
  }
}
