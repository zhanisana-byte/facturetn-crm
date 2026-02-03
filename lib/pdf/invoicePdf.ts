import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import crypto from "crypto";

type Company = {
  company_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Invoice = {
  id: string;
  invoice_no?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  currency?: string | null;

  customer_name?: string | null;
  customer_tax_id?: string | null;
  customer_address?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;

  notes?: string | null;

  subtotal_ht?: number | null;
  vat_amount?: number | null;
  stamp_duty?: number | null;
  total_ttc?: number | null;

  document_type?: string | null;
};

type Item = {
  description?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  vat_pct?: number | null;
  discount_pct?: number | null;
  discount_amount?: number | null;

  line_total_ht?: number | null;
  line_total_ttc?: number | null;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function f3(v: any) {
  const x = n(v);
  return (Math.round(x * 1000) / 1000).toFixed(3);
}

function money(v: any) {
  return `${f3(v)} DT`;
}

function ellipsize(t: string, max: number) {
  const x = s(t);
  if (x.length <= max) return x;
  return `${x.slice(0, Math.max(0, max - 1))}…`;
}

async function toPngDataUrlFromText(text: string): Promise<string | null> {
  try {
    const mod: any = await import("qrcode");
    const fn = mod?.toDataURL || mod?.default?.toDataURL;
    if (!fn) return null;
    return await fn(text, { margin: 0, width: 180 });
  } catch {
    return null;
  }
}

function dataUrlToBytes(dataUrl: string) {
  const m = /^data:.*?;base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  return Buffer.from(m[1], "base64");
}

function pickDiscount(it: any) {
  const pct = n(it.discount_pct ?? it.discountPct ?? it.remise_pct ?? it.remisePct ?? it.discount_percent ?? it.discountPercent);
  const amt = n(it.discount_amount ?? it.discountAmount ?? it.remise_amount ?? it.remiseAmount ?? it.discount ?? it.remise);
  return { pct, amt };
}

function computeLine(it: any) {
  const qty = n(it.qty ?? it.quantity);
  const pu = n(it.unit_price ?? it.unit_price_ht ?? it.unitPrice ?? it.unitPriceHt);
  const vatPct = n(it.vat_pct ?? it.vatPct ?? it.tva_pct ?? it.tvaPct ?? it.vat);
  const base = qty * pu;

  const { pct, amt } = pickDiscount(it);
  const remise = amt > 0 ? amt : pct > 0 ? (base * pct) / 100 : 0;

  const ht = Math.max(0, base - remise);
  const vat = (ht * vatPct) / 100;
  const ttc = ht + vat;

  return { qty, pu, vatPct, remise, ht, vat, ttc };
}

function splitHash(h: string) {
  const x = s(h);
  const a = x.slice(0, 24);
  const b = x.slice(24, 48);
  const c = x.slice(48, 72);
  return [a, b, c].filter(Boolean);
}

export async function buildInvoicePdf(opts: { company: Company; invoice: Invoice; items: Item[] }): Promise<Uint8Array> {
  const { company, invoice, items } = opts;

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595.28;
  const pageH = 841.89;

  const marginX = 54;
  const top = pageH - 64;
  const bottom = 64;

  const docType = s(invoice.document_type || "FACTURE").toUpperCase();
  const invNo = s(invoice.invoice_no || invoice.id || "");
  const invDate = s(invoice.issue_date).slice(0, 10) || new Date().toISOString().slice(0, 10);

  const sellerName = s(company.company_name || "");
  const sellerTax = s(company.tax_id || "");
  const sellerAddr1 = s(company.address || "");
  const sellerAddr2 = [s(company.postal_code || ""), s(company.city || ""), s(company.country || "TN")]
    .filter(Boolean)
    .join(" ");

  const custName = s(invoice.customer_name || "");
  const custTax = s(invoice.customer_tax_id || "");
  const custTel = s(invoice.customer_phone || "");
  const custAddr = s(invoice.customer_address || "");

  const ref = invoice.id;
  const sha = crypto.createHash("sha256").update(`${ref}|${invNo}|${invDate}`, "utf8").digest("hex");
  const qrText = JSON.stringify({ ref, sha256: sha });

  const qrDataUrl = await toPngDataUrlFromText(qrText);
  let qrImg: any = null;
  if (qrDataUrl) {
    const bytes = dataUrlToBytes(qrDataUrl);
    if (bytes) {
      try {
        qrImg = await pdf.embedPng(bytes);
      } catch {
        qrImg = null;
      }
    }
  }

  let totalHt = 0;
  let totalVat = 0;

  for (const it of items || []) {
    const { ht, vat } = computeLine(it);
    totalHt += ht;
    totalVat += vat;
  }

  const stamp = invoice.stamp_duty != null ? n(invoice.stamp_duty) : 1.0;
  const totalTtc = totalHt + totalVat + stamp;

  const cols = {
    desc: marginX,
    qty: pageW - marginX - 340,
    pu: pageW - marginX - 270,
    rem: pageW - marginX - 195,
    tva: pageW - marginX - 125,
    ttc: pageW - marginX - 60,
  };

  const rowH = 14;
  const discountH = 12;
  const separatorH = 10;

  const totalsBlockH = 72;
  const totalsTopPadding = 10;

  function drawHeader(page: any) {
    page.drawText(docType, { x: marginX, y: top, size: 22, font: bold, color: rgb(0, 0, 0) });
    page.drawText(`N°: ${invNo}`, { x: marginX, y: top - 22, size: 10.5, font });
    page.drawText(`Date: ${invDate}`, { x: marginX, y: top - 36, size: 10.5, font });

    const qrSize = 104;
    const qrX = pageW - marginX - qrSize;
    const qrY = top - 18 - qrSize;

    let qrBlockBottom = qrY;

    if (qrImg) {
      page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });

      const refSafe = `Ref: ${ellipsize(ref, 22)}`;
      page.drawText(refSafe, { x: qrX, y: qrY - 13, size: 7.4, font, color: rgb(0.15, 0.15, 0.17) });

      const shaParts = splitHash(sha);
      page.drawText(`SHA256: ${shaParts[0] || ""}`, { x: qrX, y: qrY - 24, size: 7.4, font, color: rgb(0.15, 0.15, 0.17) });
      if (shaParts[1]) page.drawText(shaParts[1], { x: qrX, y: qrY - 34, size: 7.4, font, color: rgb(0.15, 0.15, 0.17) });
      if (shaParts[2]) page.drawText(shaParts[2], { x: qrX, y: qrY - 44, size: 7.4, font, color: rgb(0.15, 0.15, 0.17) });

      qrBlockBottom = qrY - 52;
    }

    const blockTop = top - 78;

    page.drawText(ellipsize(sellerName || "—", 40), { x: marginX, y: blockTop, size: 12, font: bold });
    let ly = blockTop - 16;
    if (sellerTax) {
      page.drawText(`MF: ${ellipsize(sellerTax, 34)}`, { x: marginX, y: ly, size: 10.2, font });
      ly -= 13;
    }
    if (sellerAddr1) {
      page.drawText(ellipsize(sellerAddr1, 52), { x: marginX, y: ly, size: 10.2, font });
      ly -= 13;
    }
    if (sellerAddr2) {
      page.drawText(ellipsize(sellerAddr2, 52), { x: marginX, y: ly, size: 10.2, font });
      ly -= 13;
    }

    const rightX = pageW - marginX - 250;
    page.drawText("Client", { x: rightX, y: blockTop, size: 12, font: bold });
    let ry = blockTop - 16;
    page.drawText(ellipsize(custName || "—", 40), { x: rightX, y: ry, size: 10.2, font });
    ry -= 13;
    if (custTax) {
      page.drawText(`MF: ${ellipsize(custTax, 34)}`, { x: rightX, y: ry, size: 10.2, font });
      ry -= 13;
    }
    if (custTel) {
      page.drawText(`Tél: ${ellipsize(custTel, 34)}`, { x: rightX, y: ry, size: 10.2, font });
      ry -= 13;
    }
    if (custAddr) {
      page.drawText(ellipsize(custAddr, 52), { x: rightX, y: ry, size: 10.2, font });
      ry -= 13;
    }

    const baseTableTop = Math.min(ly, ry) - 44;
    const tableTop = Math.min(baseTableTop, qrBlockBottom - 28);

    page.drawText("Description", { x: cols.desc, y: tableTop, size: 10.5, font: bold });
    page.drawText("Qté", { x: cols.qty, y: tableTop, size: 10.5, font: bold });
    page.drawText("PU HT", { x: cols.pu, y: tableTop, size: 10.5, font: bold });
    page.drawText("Remise", { x: cols.rem, y: tableTop, size: 10.5, font: bold });
    page.drawText("TVA%", { x: cols.tva, y: tableTop, size: 10.5, font: bold });
    page.drawText("TTC", { x: cols.ttc, y: tableTop, size: 10.5, font: bold });

    const lineY = tableTop - 10;
    page.drawLine({ start: { x: marginX, y: lineY }, end: { x: pageW - marginX, y: lineY }, thickness: 1, color: rgb(0.82, 0.84, 0.86) });

    return tableTop - 26;
  }

  function drawTotals(page: any) {
    const totalsX = pageW - marginX - 220;
    const baseY = bottom + totalsBlockH;

    page.drawLine({ start: { x: marginX, y: baseY + totalsTopPadding }, end: { x: pageW - marginX, y: baseY + totalsTopPadding }, thickness: 1, color: rgb(0.86, 0.87, 0.88) });

    let ty = baseY - 8;

    const rows: Array<[string, string, boolean]> = [
      ["Total HT", money(totalHt), false],
      ["Total TVA", money(totalVat), false],
      ["Timbre", money(stamp), false],
      ["Total TTC", money(totalTtc), true],
    ];

    for (const [k, v, strong] of rows) {
      page.drawText(k, { x: totalsX, y: ty, size: strong ? 11.5 : 10.2, font: strong ? bold : font });
      page.drawText(v, { x: pageW - marginX - 80, y: ty, size: strong ? 11.5 : 10.2, font: strong ? bold : font });
      ty -= strong ? 16 : 13;
    }

    if (invoice.notes) {
      const noteY = bottom;
      page.drawText("Note:", { x: marginX, y: noteY + 10, size: 9.5, font: bold, color: rgb(0.25, 0.25, 0.28) });
      page.drawText(ellipsize(s(invoice.notes), 110), { x: marginX + 34, y: noteY + 10, size: 9.5, font, color: rgb(0.25, 0.25, 0.28) });
    }
  }

  function availableBottom(isLast: boolean) {
    return isLast ? bottom + totalsBlockH + 18 : bottom;
  }

  const allItems = items || [];
  let idx = 0;

  while (idx < allItems.length || (allItems.length === 0 && idx === 0)) {
    const page = pdf.addPage([pageW, pageH]);
    let y = drawHeader(page);

    if (allItems.length === 0) {
      page.drawText("Aucune ligne.", { x: marginX, y: y - 6, size: 10.2, font, color: rgb(0.35, 0.35, 0.4) });
      drawTotals(page);
      break;
    }

    while (idx < allItems.length) {
      const it = allItems[idx];
      const { qty, pu, vatPct, remise, ttc } = computeLine(it);
      const hasDiscount = remise > 0;

      const needed = rowH + (hasDiscount ? discountH : 0) + separatorH;
      const willBeLastPage = idx === allItems.length - 1;
      const lim = availableBottom(willBeLastPage);

      if (y - needed < lim) break;

      const desc = s(it.description || "");
      page.drawText(ellipsize(desc || "—", 52), { x: cols.desc, y, size: 10.2, font });
      page.drawText(f3(qty), { x: cols.qty, y, size: 10.2, font });
      page.drawText(f3(pu), { x: cols.pu, y, size: 10.2, font });

      if (hasDiscount) {
        const { pct, amt } = pickDiscount(it as any);
        const remTxt = amt > 0 ? `-${f3(amt)}` : pct > 0 ? `-${f3(pct)}%` : `-${f3(remise)}`;
        page.drawText(remTxt, { x: cols.rem, y, size: 10.2, font });
      } else {
        page.drawText("—", { x: cols.rem, y, size: 10.2, font });
      }

      page.drawText(f3(vatPct), { x: cols.tva, y, size: 10.2, font });
      page.drawText(money(ttc), { x: cols.ttc, y, size: 10.2, font });

      y -= rowH;

      if (hasDiscount) {
        const { pct, amt } = pickDiscount(it as any);
        const label = amt > 0 ? `Remise: -${money(amt)}` : pct > 0 ? `Remise: -${f3(pct)}%` : `Remise: -${money(remise)}`;
        page.drawText(label, { x: cols.desc + 10, y, size: 9.2, font, color: rgb(0.35, 0.35, 0.4) });
        y -= discountH;
      }

      page.drawLine({ start: { x: marginX, y: y + 4 }, end: { x: pageW - marginX, y: y + 4 }, thickness: 0.8, color: rgb(0.9, 0.91, 0.92) });
      y -= separatorH;

      idx++;
    }

    if (idx >= allItems.length) {
      drawTotals(page);
      break;
    }
  }

  return await pdf.save();
}

export async function invoicePdf(a: { company: Company; invoice: Invoice; items: Item[] } | any, b?: any): Promise<Uint8Array> {
  if (a && typeof a === "object" && "company" in a && "invoice" in a && "items" in a && b == null) {
    return buildInvoicePdf(a as { company: Company; invoice: Invoice; items: Item[] });
  }

  const inv = a || {};
  const itemsRaw = Array.isArray(b) ? b : [];

  const company: Company = {
    company_name: s(inv.seller_name || inv.company_name || inv.company || ""),
    tax_id: s(inv.seller_tax_id || inv.tax_id || inv.taxId || ""),
    address: s(inv.seller_address || inv.address || ""),
    city: s(inv.seller_city || inv.city || ""),
    postal_code: s(inv.seller_postal_code || inv.postal_code || ""),
    country: s(inv.seller_country || inv.country || "TN"),
    phone: s(inv.seller_phone || inv.phone || ""),
    email: s(inv.seller_email || inv.email || ""),
  };

  const invoice: Invoice = {
    id: s(inv.id || inv.invoice_id || inv.invoiceId || ""),
    invoice_no: s(inv.invoice_no || inv.invoice_number || inv.number || ""),
    issue_date: s(inv.issue_date || inv.date || ""),
    due_date: s(inv.due_date || ""),
    currency: s(inv.currency || "TND"),

    customer_name: s(inv.customer_name || ""),
    customer_tax_id: s(inv.customer_tax_id || ""),
    customer_address: s(inv.customer_address || ""),
    customer_email: s(inv.customer_email || ""),
    customer_phone: s(inv.customer_phone || ""),

    notes: s(inv.notes || ""),

    subtotal_ht: inv.subtotal_ht != null ? n(inv.subtotal_ht) : null,
    vat_amount: inv.vat_amount != null ? n(inv.vat_amount) : null,
    stamp_duty: inv.stamp_duty != null ? n(inv.stamp_duty) : inv.stamp_amount != null ? n(inv.stamp_amount) : null,
    total_ttc: inv.total_ttc != null ? n(inv.total_ttc) : inv.net_to_pay != null ? n(inv.net_to_pay) : null,

    document_type: s(inv.document_type || inv.documentType || "FACTURE"),
  };

  const items: Item[] = itemsRaw.map((it: any) => ({
    description: s(it.description || ""),
    qty: n(it.qty ?? it.quantity ?? 0),
    unit_price: n(it.unit_price ?? it.unit_price_ht ?? it.unitPrice ?? it.unitPriceHt ?? 0),
    vat_pct: n(it.vat_pct ?? it.vatPct ?? it.tva_pct ?? it.tvaPct ?? it.vat ?? 0),
    discount_pct: n(it.discount_pct ?? it.discountPct ?? it.remise_pct ?? it.remisePct ?? it.discount_percent ?? it.discountPercent ?? 0),
    discount_amount: n(it.discount_amount ?? it.discountAmount ?? it.remise_amount ?? it.remiseAmount ?? it.discount ?? it.remise ?? 0),
    line_total_ht: it.line_total_ht != null ? n(it.line_total_ht) : null,
    line_total_ttc: it.line_total_ttc != null ? n(it.line_total_ttc) : null,
  }));

  return buildInvoicePdf({ company, invoice, items });
}
