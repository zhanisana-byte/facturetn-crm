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

export async function buildInvoicePdf(opts: {
  company: Company;
  invoice: Invoice;
  items: Item[];
}): Promise<Uint8Array> {
  const { company, invoice, items } = opts;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const marginX = 54;
  const top = height - 64;

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

  page.drawText(docType, { x: marginX, y: top, size: 22, font: bold, color: rgb(0, 0, 0) });
  page.drawText(`N°: ${invNo}`, { x: marginX, y: top - 22, size: 10.5, font });
  page.drawText(`Date: ${invDate}`, { x: marginX, y: top - 36, size: 10.5, font });

  const qrSize = 110;
  const qrX = width - marginX - qrSize;
  const qrY = top - 18 - qrSize;

  if (qrImg) {
    page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    page.drawText(`Ref: ${ellipsize(ref, 34)}`, { x: qrX, y: qrY - 14, size: 7.8, font, color: rgb(0.15, 0.15, 0.17) });
    page.drawText(`SHA256: ${ellipsize(sha, 34)}`, { x: qrX, y: qrY - 26, size: 7.8, font, color: rgb(0.15, 0.15, 0.17) });
  }

  const leftX = marginX;
  const blockTop = top - 78;

  page.drawText(ellipsize(sellerName || "—", 40), { x: leftX, y: blockTop, size: 12, font: bold });
  let ly = blockTop - 16;
  if (sellerTax) {
    page.drawText(`MF: ${ellipsize(sellerTax, 34)}`, { x: leftX, y: ly, size: 10.2, font });
    ly -= 13;
  }
  if (sellerAddr1) {
    page.drawText(ellipsize(sellerAddr1, 52), { x: leftX, y: ly, size: 10.2, font });
    ly -= 13;
  }
  if (sellerAddr2) {
    page.drawText(ellipsize(sellerAddr2, 52), { x: leftX, y: ly, size: 10.2, font });
    ly -= 13;
  }

  const rightX = width - marginX - 250;
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

  const tableTop = Math.min(ly, ry) - 44;

  const cols = {
    desc: marginX,
    qty: width - marginX - 280,
    pu: width - marginX - 210,
    tva: width - marginX - 135,
    ttc: width - marginX - 60,
  };

  const headerY = tableTop;
  page.drawText("Description", { x: cols.desc, y: headerY, size: 10.5, font: bold });
  page.drawText("Qté", { x: cols.qty, y: headerY, size: 10.5, font: bold });
  page.drawText("PU HT", { x: cols.pu, y: headerY, size: 10.5, font: bold });
  page.drawText("TVA%", { x: cols.tva, y: headerY, size: 10.5, font: bold });
  page.drawText("TTC", { x: cols.ttc, y: headerY, size: 10.5, font: bold });

  const lineY = headerY - 10;
  page.drawLine({ start: { x: marginX, y: lineY }, end: { x: width - marginX, y: lineY }, thickness: 1, color: rgb(0.82, 0.84, 0.86) });

  let y = headerY - 26;

  const maxLines = 14;
  const sliced = (items || []).slice(0, maxLines);

  let totalHt = 0;
  let totalVat = 0;

  for (const it of sliced) {
    const { qty, pu, vatPct, remise, ht, vat, ttc } = computeLine(it);

    totalHt += ht;
    totalVat += vat;

    const desc = s(it.description || "");
    const hasDiscount = remise > 0;

    page.drawText(ellipsize(desc || "—", 52), { x: cols.desc, y, size: 10.2, font });
    page.drawText(f3(qty), { x: cols.qty, y, size: 10.2, font });
    page.drawText(f3(pu), { x: cols.pu, y, size: 10.2, font });
    page.drawText(f3(vatPct), { x: cols.tva, y, size: 10.2, font });
    page.drawText(money(ttc), { x: cols.ttc, y, size: 10.2, font });

    y -= 14;

    if (hasDiscount) {
      const { pct, amt } = pickDiscount(it as any);
      const label =
        amt > 0 ? `Remise: -${money(amt)}` : pct > 0 ? `Remise: -${f3(pct)}%` : `Remise: -${money(remise)}`;
      page.drawText(label, { x: cols.desc + 10, y, size: 9.2, font, color: rgb(0.35, 0.35, 0.4) });
      y -= 12;
    }

    page.drawLine({ start: { x: marginX, y: y + 4 }, end: { x: width - marginX, y: y + 4 }, thickness: 0.8, color: rgb(0.9, 0.91, 0.92) });
    y -= 10;
  }

  const stamp = invoice.stamp_duty != null ? n(invoice.stamp_duty) : 1.0;
  const totalTtc = totalHt + totalVat + stamp;

  const totalsX = width - marginX - 220;
  let ty = y - 6;

  const rows: Array<[string, string, boolean]> = [
    ["Total HT", money(totalHt), false],
    ["Total TVA", money(totalVat), false],
    ["Timbre", money(stamp), false],
    ["Total TTC", money(totalTtc), true],
  ];

  for (const [k, v, strong] of rows) {
    page.drawText(k, { x: totalsX, y: ty, size: strong ? 11.5 : 10.2, font: strong ? bold : font });
    page.drawText(v, { x: width - marginX - 80, y: ty, size: strong ? 11.5 : 10.2, font: strong ? bold : font });
    ty -= strong ? 16 : 13;
  }

  if (invoice.notes) {
    const noteY = 70;
    page.drawText("Note:", { x: marginX, y: noteY, size: 9.5, font: bold, color: rgb(0.25, 0.25, 0.28) });
    page.drawText(ellipsize(s(invoice.notes), 110), { x: marginX + 34, y: noteY, size: 9.5, font, color: rgb(0.25, 0.25, 0.28) });
  }

  return await pdf.save();
}

export async function invoicePdf(
  a: { company: Company; invoice: Invoice; items: Item[] } | any,
  b?: any
): Promise<Uint8Array> {
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
