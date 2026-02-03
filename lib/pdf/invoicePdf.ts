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

  notes?: string | null;

  subtotal_ht?: number | null;
  vat_amount?: number | null;
  stamp_duty?: number | null;
  net_to_pay?: number | null;

  document_type?: string | null;
};

type Item = {
  description?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  vat_pct?: number | null;
  line_total_ht?: number | null;
  line_total_ttc?: number | null;
};

function safe(v: any) {
  return String(v ?? "").trim();
}

function n3(v: any) {
  const x = Number(v ?? 0);
  const y = Number.isFinite(x) ? x : 0;
  return (Math.round(y * 1000) / 1000).toFixed(3);
}

function moneyDt(v: any) {
  return `${n3(v)} DT`;
}

function ellipsize(str: string, max: number) {
  const t = safe(str);
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
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

  const margin = 42;
  let y = height - margin;

  const sellerName = safe(company.company_name) || "Société";
  const sellerTax = safe(company.tax_id);
  const sellerAddr = safe(company.address);
  const sellerCity = safe(company.city);
  const sellerZip = safe(company.postal_code);
  const sellerCountry = safe(company.country) || "TN";

  const docType = safe(invoice.document_type || "FACTURE").toUpperCase();
  const invNo = safe(invoice.invoice_no) || safe(invoice.id).slice(0, 8).toUpperCase();
  const issueDate = safe(invoice.issue_date).slice(0, 10) || new Date().toISOString().slice(0, 10);

  page.drawText(sellerName, {
    x: margin,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.12),
  });

  page.drawText(docType, {
    x: width - margin - 200,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.12),
  });

  y -= 20;

  const sellerLines = [
    sellerTax ? `MF: ${sellerTax}` : "",
    sellerAddr,
    [sellerZip, sellerCity].filter(Boolean).join(" "),
    sellerCountry,
  ].filter(Boolean);

  sellerLines.forEach((line) => {
    page.drawText(ellipsize(line, 60), {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.25),
    });
    y -= 13;
  });

  const metaX = width - margin - 200;
  let my = height - margin - 22;

  const meta: [string, string][] = [
    ["N°", invNo],
    ["Date", issueDate],
  ];

  if (invoice.due_date) meta.push(["Échéance", safe(invoice.due_date).slice(0, 10)]);

  meta.forEach(([k, v]) => {
    page.drawText(`${k}:`, { x: metaX, y: my, size: 10, font: fontBold });
    page.drawText(v, { x: metaX + 70, y: my, size: 10, font });
    my -= 13;
  });

  y -= 6;

  page.drawText("Client", { x: margin, y, size: 12, font: fontBold });
  y -= 14;

  const custLines = [
    safe(invoice.customer_name),
    safe(invoice.customer_tax_id) ? `MF: ${safe(invoice.customer_tax_id)}` : "",
    safe(invoice.customer_address),
    safe(invoice.customer_email),
    safe(invoice.customer_phone),
  ].filter(Boolean);

  custLines.forEach((line) => {
    page.drawText(ellipsize(line, 70), { x: margin, y, size: 10, font });
    y -= 13;
  });

  if (invoice.notes) {
    y -= 4;
    page.drawText("Note", { x: margin, y, size: 10, font: fontBold });
    y -= 12;
    page.drawText(ellipsize(safe(invoice.notes), 95), { x: margin, y, size: 10, font });
    y -= 12;
  }

  y -= 6;

  const col = {
    desc: margin,
    qty: width - margin - 270,
    pu: width - margin - 210,
    tva: width - margin - 150,
    ht: width - margin - 90,
    ttc: width - margin - 10,
  };

  const headerY = y;
  page.drawText("Désignation", { x: col.desc, y: headerY, size: 10, font: fontBold });
  page.drawText("Qté", { x: col.qty, y: headerY, size: 10, font: fontBold });
  page.drawText("PU HT", { x: col.pu, y: headerY, size: 10, font: fontBold });
  page.drawText("TVA%", { x: col.tva, y: headerY, size: 10, font: fontBold });
  page.drawText("Total HT", { x: col.ht, y: headerY, size: 10, font: fontBold });
  page.drawText("Total TTC", { x: col.ttc - 60, y: headerY, size: 10, font: fontBold });

  y -= 16;

  const maxLines = 18;
  const sliced = (items || []).slice(0, maxLines);

  sliced.forEach((it) => {
    const qty = Number(it.qty ?? 0);
    const pu = Number(it.unit_price ?? 0);
    const vatPct = Number(it.vat_pct ?? 0);

    const totalHt =
      it.line_total_ht != null ? Number(it.line_total_ht) : Number.isFinite(qty * pu) ? qty * pu : 0;

    const totalTtc =
      it.line_total_ttc != null
        ? Number(it.line_total_ttc)
        : Number.isFinite(totalHt * (1 + vatPct / 100))
        ? totalHt * (1 + vatPct / 100)
        : 0;

    page.drawText(ellipsize(safe(it.description), 44), { x: col.desc, y, size: 10, font });
    page.drawText(n3(qty), { x: col.qty, y, size: 10, font });
    page.drawText(moneyDt(pu), { x: col.pu, y, size: 10, font });
    page.drawText(n3(vatPct), { x: col.tva, y, size: 10, font });
    page.drawText(moneyDt(totalHt), { x: col.ht, y, size: 10, font });
    page.drawText(moneyDt(totalTtc), { x: col.ttc - 70, y, size: 10, font });

    y -= 13;
  });

  y -= 10;

  const subtotal = invoice.subtotal_ht != null ? Number(invoice.subtotal_ht) : sliced.reduce((sum, it) => sum + Number(it.line_total_ht ?? 0), 0);
  const vat = invoice.vat_amount != null ? Number(invoice.vat_amount) : 0;
  const stamp = invoice.stamp_duty != null ? Number(invoice.stamp_duty) : 0;
  const net = invoice.net_to_pay != null ? Number(invoice.net_to_pay) : subtotal + vat + stamp;

  const totals: [string, string][] = [
    ["Sous-total", moneyDt(subtotal)],
    ["TVA", moneyDt(vat)],
    ["Timbre fiscal", moneyDt(stamp)],
    ["Net à payer", moneyDt(net)],
  ];

  let ty = y;
  const tx = width - margin - 220;

  totals.forEach(([k, v], i) => {
    const isLast = i === totals.length - 1;
    page.drawText(k, { x: tx, y: ty, size: isLast ? 12 : 10, font: isLast ? fontBold : font });
    page.drawText(v, { x: width - margin - 90, y: ty, size: isLast ? 12 : 10, font: isLast ? fontBold : font });
    ty -= isLast ? 16 : 13;
  });

  page.drawText("Généré par FactureTN", {
    x: margin,
    y: 24,
    size: 9,
    font,
    color: rgb(0.45, 0.45, 0.5),
  });

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
    company_name: safe(inv.seller_name || inv.company_name || inv.company || ""),
    tax_id: safe(inv.seller_tax_id || inv.tax_id || inv.taxId || ""),
    address: safe(inv.seller_address || inv.address || ""),
    city: safe(inv.seller_city || inv.city || ""),
    postal_code: safe(inv.seller_postal_code || inv.postal_code || ""),
    country: safe(inv.seller_country || inv.country || "TN"),
  };

  const invoice: Invoice = {
    id: safe(inv.id || inv.invoice_id || inv.invoiceId || ""),
    invoice_no: safe(inv.invoice_no || inv.invoice_number || inv.number || ""),
    issue_date: safe(inv.issue_date || inv.date || ""),
    due_date: safe(inv.due_date || ""),
    currency: safe(inv.currency || "TND"),

    customer_name: safe(inv.customer_name || ""),
    customer_tax_id: safe(inv.customer_tax_id || ""),
    customer_address: safe(inv.customer_address || ""),
    customer_email: safe(inv.customer_email || ""),
    customer_phone: safe(inv.customer_phone || ""),

    notes: safe(inv.notes || ""),

    subtotal_ht: inv.subtotal_ht != null ? Number(inv.subtotal_ht) : 0,
    vat_amount: inv.vat_amount != null ? Number(inv.vat_amount) : 0,
    stamp_duty: inv.stamp_duty != null ? Number(inv.stamp_duty) : 0,
    net_to_pay: inv.net_to_pay != null ? Number(inv.net_to_pay) : 0,

    document_type: safe(inv.document_type || inv.documentType || "FACTURE"),
  };

  const items: Item[] = itemsRaw.map((it: any) => ({
    description: safe(it.description || ""),
    qty: Number(it.qty ?? it.quantity ?? 0),
    unit_price: Number(it.unit_price ?? it.unit_price_ht ?? 0),
    vat_pct: Number(it.vat_pct ?? 0),
    line_total_ht: it.line_total_ht != null ? Number(it.line_total_ht) : undefined,
    line_total_ttc: it.line_total_ttc != null ? Number(it.line_total_ttc) : undefined,
  }));

  return buildInvoicePdf({ company, invoice, items });
}
