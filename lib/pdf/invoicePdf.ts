import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Company = {
  company_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
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
  vat_amount?: number | null;
};

type Item = {
  description?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
};

function money(n: any, currency: string) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("fr-TN", {
    style: "currency",
    currency: currency || "TND",
    maximumFractionDigits: 3,
  }).format(v);
}

function safe(s: any) {
  return String(s ?? "").trim();
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
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 40;
  let y = height - margin;

  page.drawText(safe(company.company_name) || "Société", {
    x: margin,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.12),
  });

  const rightX = width - margin - 200;
  page.drawText("FACTURE", {
    x: rightX,
    y,
    size: 20,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.12),
  });

  y -= 26;

  const companyLines = [
    safe(company.tax_id) ? `MF: ${safe(company.tax_id)}` : "",
    safe(company.address) ? safe(company.address) : "",
    [safe(company.postal_code), safe(company.city)].filter(Boolean).join(" "),
    safe(company.country) ? safe(company.country) : "",
  ].filter(Boolean);

  companyLines.forEach((line) => {
    page.drawText(line, { x: margin, y, size: 10, font, color: rgb(0.2, 0.2, 0.25) });
    y -= 14;
  });

  const metaYTop = height - margin - 28;
  const issue = safe(invoice.issue_date).slice(0, 10) || new Date().toISOString().slice(0, 10);

  const meta: [string, string][] = [
    ["N°", safe(invoice.invoice_no) || safe(invoice.id).slice(0, 8).toUpperCase()],
    ["Date", issue],
    ...(invoice.due_date ? [["Échéance", safe(invoice.due_date).slice(0, 10)]] : []),
  ];

  let my = metaYTop;
  meta.forEach(([k, v]) => {
    page.drawText(`${k}:`, { x: rightX, y: my, size: 10, font: fontBold });
    page.drawText(String(v), { x: rightX + 70, y: my, size: 10, font });
    my -= 14;
  });

  y -= 12;
  page.drawText("Client", { x: margin, y, size: 12, font: fontBold });
  y -= 16;

  const custLines = [
    safe(invoice.customer_name),
    safe(invoice.customer_tax_id) ? `MF: ${safe(invoice.customer_tax_id)}` : "",
    safe(invoice.customer_address),
    safe(invoice.customer_email),
    safe(invoice.customer_phone),
  ].filter(Boolean);

  custLines.forEach((line) => {
    page.drawText(line, { x: margin, y, size: 10, font });
    y -= 14;
  });

  y -= 12;
  const tableTop = y;
  const cols = {
    desc: margin,
    qty: width - margin - 200,
    unit: width - margin - 140,
    total: width - margin - 70,
  };

  page.drawLine({
    start: { x: margin, y: tableTop + 18 },
    end: { x: width - margin, y: tableTop + 18 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.85),
  });

  page.drawText("Désignation", { x: cols.desc, y: tableTop, size: 10, font: fontBold });
  page.drawText("Qté", { x: cols.qty, y: tableTop, size: 10, font: fontBold });
  page.drawText("PU", { x: cols.unit, y: tableTop, size: 10, font: fontBold });
  page.drawText("Total", { x: cols.total, y: tableTop, size: 10, font: fontBold });

  y -= 18;

  const currency = safe(invoice.currency) || "TND";

  const maxLines = 20;
  const sliced = items.slice(0, maxLines);

  sliced.forEach((it) => {
    const desc = safe(it.description) || "-";
    const qty = Number(it.qty ?? 0);
    const pu = Number(it.unit_price ?? 0);
    const lineTotal = Number(it.line_total ?? qty * pu);

    page.drawText(desc.slice(0, 70), { x: cols.desc, y, size: 10, font });
    page.drawText(String(qty), { x: cols.qty, y, size: 10, font });
    page.drawText(money(pu, currency), { x: cols.unit, y, size: 10, font });
    page.drawText(money(lineTotal, currency), { x: cols.total, y, size: 10, font });

    y -= 14;
  });

  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.85),
  });
  y -= 18;

  const subtotal = sliced.reduce((s, it) => {
    const qty = Number(it.qty ?? 0);
    const pu = Number(it.unit_price ?? 0);
    const lineTotal = Number(it.line_total ?? qty * pu);
    return s + lineTotal;
  }, 0);

  const vat = Number(invoice.vat_amount ?? 0);
  const stamp = 1.0;
  const totalTTC = subtotal + vat + stamp;

  const totals: [string, string][] = [
    ["Sous-total", money(subtotal, currency)],
    ["TVA", money(vat, currency)],
    ["Timbre fiscal", money(stamp, currency)],
    ["Total TTC", money(totalTTC, currency)],
  ];

  let ty = y;
  totals.forEach(([k, v], i) => {
    const isTotal = i === totals.length - 1;
    page.drawText(k, { x: width - margin - 200, y: ty, size: isTotal ? 12 : 10, font: isTotal ? fontBold : font });
    page.drawText(v, { x: width - margin - 80, y: ty, size: isTotal ? 12 : 10, font: isTotal ? fontBold : font });
    ty -= isTotal ? 18 : 14;
  });

  page.drawText("Généré par FactureTN", {
    x: margin,
    y: margin - 10,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.5),
  });

  return await pdf.save();
}
