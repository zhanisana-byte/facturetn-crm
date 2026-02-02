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
    const sellerMF = safe(company?.tax_id || "");
    const sellerAdr = safe(company?.address || "");
    const sellerCity = [company?.postal_code, company?.city, company?.country].filter(Boolean).join(" ");
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
      const qty = toNum(it.quantity);
      const pu = toNum(it.unit_price_ht ?? it.unit_price);
      const vatPct = toNum(it.vat_pct ?? it.vat);
      const ht = round3(toNum(it.line_total_ht ?? (qty * pu)));
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

    const ink = rgb(0.08, 0.1, 0.12);
    const muted = rgb(0.35, 0.37, 0.4);
    const line = rgb(0.86, 0.87, 0.89);
    const soft = rgb(0.97, 0.97, 0.98);
    const chip = rgb(0.92, 0.94, 0.96);

    const fmtMoney = (n: number) => `${Number(n).toFixed(3)} ${currency}`;

    const addPage = () => pdfDoc.addPage([PAGE_W, PAGE_H]);

    const drawBox = (page: PDFPage, x: number, y: number, w: number, h: number, fill = soft) => {
      page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: line, borderWidth: 1 });
    };

    const drawTxt = (
      page: PDFPage,
      text: string,
      x: number,
      y: number,
      size: number,
      bold = false,
      color = ink
    ) => {
      page.drawText(String(text ?? ""), { x, y, size, font: bold ? fontBold : font, color });
    };

    const header = (page: PDFPage) => {
      const top = PAGE_H - margin;

      page.drawRectangle({
        x: margin,
        y: top - 34,
        width: PAGE_W - margin * 2,
        height: 34,
        color: chip,
        borderColor: line,
        borderWidth: 1,
      });

      drawTxt(page, docType, margin + 12, top - 24, 14, true);

      const rightX = PAGE_W - margin - 220;
      drawTxt(page, `N° : ${invNumber || "—"}`, rightX, top - 24, 10, true);
      drawTxt(page, `Date : ${issueDate}`, rightX, top - 38, 9, false, muted);
      if (dueDate) drawTxt(page, `Échéance : ${dueDate}`, rightX, top - 52, 9, false, muted);

      const boxY = top - 34 - 12 - 120;
      const boxH = 120;
      const boxW = (PAGE_W - margin * 2 - 12) / 2;

      drawBox(page, margin, boxY, boxW, boxH);
      drawBox(page, margin + boxW + 12, boxY, boxW, boxH);

      drawTxt(page, "VENDEUR (SOCIÉTÉ)", margin + 10, boxY + boxH - 16, 8, true, muted);
      drawTxt(page, sellerName, margin + 10, boxY + boxH - 34, 11, true);
      if (sellerMF) drawTxt(page, `MF : ${sellerMF}`, margin + 10, boxY + boxH - 50, 9, false);
      if (sellerAdr) drawTxt(page, sellerAdr, margin + 10, boxY + boxH - 64, 9, false);
      if (sellerCity) drawTxt(page, sellerCity, margin + 10, boxY + boxH - 78, 9, false);

      const sellerContact = [sellerTel ? `Tél: ${sellerTel}` : "", sellerEmail ? `Email: ${sellerEmail}` : ""]
        .filter(Boolean)
        .join("  •  ");
      if (sellerContact) drawTxt(page, sellerContact, margin + 10, boxY + 12, 8, false, muted);

      const bx = margin + boxW + 12;
      drawTxt(page, "ACHETEUR (CLIENT)", bx + 10, boxY + boxH - 16, 8, true, muted);
      drawTxt(page, buyerName || "—", bx + 10, boxY + boxH - 34, 11, true);
      if (buyerMF) drawTxt(page, `MF : ${buyerMF}`, bx + 10, boxY + boxH - 50, 9, false);
      if (buyerAdr) drawTxt(page, buyerAdr, bx + 10, boxY + boxH - 64, 9, false);
      if (dest) drawTxt(page, `Destination : ${dest}`, bx + 10, boxY + boxH - 78, 9, false);

      const buyerContact = [buyerTel ? `Tél: ${buyerTel}` : "", buyerEmail ? `Email: ${buyerEmail}` : ""]
        .filter(Boolean)
        .join("  •  ");
      if (buyerContact) drawTxt(page, buyerContact, bx + 10, boxY + 12, 8, false, muted);

      return boxY - 18;
    };

    const tableHeader = (page: PDFPage, y: number) => {
      const x0 = margin;
      const w = PAGE_W - margin * 2;

      page.drawRectangle({
        x: x0,
        y: y - 20,
        width: w,
        height: 22,
        color: chip,
        borderColor: line,
        borderWidth: 1,
      });

      const colDesc = x0 + 8;
      const colQty = x0 + 280;
      const colPU = x0 + 330;
      const colHT = x0 + 395;
      const colTVA = x0 + 452;
      const colTTC = x0 + 515;

      drawTxt(page, "Désignation", colDesc, y - 14, 9, true);
      drawTxt(page, "Qté", colQty, y - 14, 9, true);
      drawTxt(page, "PU HT", colPU, y - 14, 9, true);
      drawTxt(page, "HT", colHT, y - 14, 9, true);
      drawTxt(page, "TVA", colTVA, y - 14, 9, true);
      drawTxt(page, "TTC", colTTC, y - 14, 9, true);

      return y - 28;
    };

    const ensureSpace = (y: number, needed: number) => y - needed >= 170;

    let page = addPage();
    let y = header(page);
    y = tableHeader(page, y);

    const x0 = margin;
    const colDesc = x0 + 8;
    const colQty = x0 + 280;
    const colPU = x0 + 330;
    const colHT = x0 + 395;
    const colTVA = x0 + 452;
    const colTTC = x0 + 515;

    const rowH = 16;

    for (const it of arr) {
      const desc = safe(it.description || it.name || "") || "—";
      const qty = toNum(it.quantity);
      const pu = toNum(it.unit_price_ht ?? it.unit_price);
      const vatPct = toNum(it.vat_pct ?? it.vat);
      const ht = round3(toNum(it.line_total_ht ?? (qty * pu)));
      const vatAmt = round3(ht * (vatPct / 100));
      const ttc = round3(ht + vatAmt);

      const has2 = desc.length > 52;
      const rowNeeded = has2 ? rowH + 10 : rowH;

      if (!ensureSpace(y, rowNeeded + 8)) {
        page = addPage();
        y = header(page);
        y = tableHeader(page, y);
      }

      page.drawLine({
        start: { x: margin, y: y + 4 },
        end: { x: PAGE_W - margin, y: y + 4 },
        thickness: 1,
        color: line,
      });

      const d1 = desc.slice(0, 52);
      const d2 = has2 ? desc.slice(52, 100) : "";

      drawTxt(page, d1, colDesc, y - 8, 9, false);
      if (d2) drawTxt(page, d2, colDesc, y - 20, 8, false);

      drawTxt(page, String(qty || 0), colQty, y - 8, 9, false);
      drawTxt(page, pu.toFixed(3), colPU, y - 8, 9, false);
      drawTxt(page, ht.toFixed(3), colHT, y - 8, 9, false);
      drawTxt(page, `${vatPct.toFixed(0)}%`, colTVA, y - 8, 9, false);
      drawTxt(page, ttc.toFixed(3), colTTC, y - 8, 9, false);

      y -= d2 ? (rowH + 10) : rowH;
    }

    if (!ensureSpace(y, 240)) {
      page = addPage();
      y = header(page);
      y = tableHeader(page, y);
    }

    const totalsW = 260;
    const totalsH = stamp_enabled ? 124 : 110;
    const totalsX = PAGE_W - margin - totalsW;
    const totalsY = 210;

    drawBox(page, totalsX, totalsY, totalsW, totalsH, soft);
    drawTxt(page, "TOTAUX", totalsX + 10, totalsY + totalsH - 16, 8, true, muted);

    const tRow = (label: string, value: string, yy: number, bold = false) => {
      drawTxt(page, label, totalsX + 10, yy, 9, true, muted);
      drawTxt(page, value, totalsX + 140, yy, 9, bold, ink);
    };

    let yy = totalsY + totalsH - 36;
    tRow("Total HT", fmtMoney(subtotal_ht), yy); yy -= 14;
    tRow("Total TVA", fmtMoney(total_vat), yy); yy -= 14;
    if (stamp_enabled) { tRow("Timbre", fmtMoney(stamp_amount), yy); yy -= 14; }
    tRow("Net à payer", fmtMoney(total_ttc), yy, true);

    const payloadObj: any = {
      spec: "TEIF-QR",
      version: "1.0",
      invoice: { number: invNumber, date: issueDate, currency },
      seller: { name: sellerName, mf: sellerMF, address: sellerAdr },
      buyer: { name: buyerName, mf: buyerMF, address: buyerAdr, destination: dest || "" },
      totals: { subtotal_ht, total_vat, stamp_enabled, stamp_amount, total_ttc },
      hash: "",
    };

    const hashBase = JSON.stringify({ ...payloadObj, hash: "" });
    payloadObj.hash = crypto.createHash("sha256").update(hashBase).digest("hex");

    const qrText = JSON.stringify(payloadObj);
    const qrPng = await QRCode.toDataURL(qrText, { errorCorrectionLevel: "M", margin: 1, scale: 4 });

    const qrBytes = Buffer.from(qrPng.split(",")[1], "base64");
    const qrImg = await pdfDoc.embedPng(qrBytes);

    const qrSize = 92;
    const qrX = margin;
    const qrY = 210;

    drawBox(page, qrX, qrY, 300, 110, soft);
    page.drawImage(qrImg, { x: qrX + 12, y: qrY + 10, width: qrSize, height: qrSize });

    drawTxt(page, "QR contrôle", qrX + 12 + qrSize + 12, qrY + 80, 10, true);
    drawTxt(page, "Export / vérification technique", qrX + 12 + qrSize + 12, qrY + 64, 9, false, muted);
    drawTxt(page, `Hash: ${payloadObj.hash.slice(0, 16)}…`, qrX + 12 + qrSize + 12, qrY + 48, 8, false, muted);

    const footerY = 140;
    page.drawLine({
      start: { x: margin, y: footerY + 18 },
      end: { x: PAGE_W - margin, y: footerY + 18 },
      thickness: 1,
      color: line,
    });

    const notes: string[] = [];
    if (stamp_enabled) notes.push("Timbre fiscal inclus selon paramétrage.");
    notes.push("Merci d’indiquer la référence de facture lors du paiement.");
    notes.push("Document généré électroniquement.");

    drawTxt(page, notes.join("  •  "), margin, footerY, 8, false, muted);

    const pdfBytes = await pdfDoc.save(); 
    const body = Buffer.from(pdfBytes);   

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${docType}-${invNumber || "document"}.pdf"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "PDF error" }, { status: 500 });
  }
}
