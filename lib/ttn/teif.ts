// Shared TEIF/TTN helpers (v12)
// This module builds a compact TEIF XML aligned with the official XSD v1.8.8 (without signature).
// Source references exist in `technique sana.zip` (XSD + example signed XML).
//
// NOTE: Full production compliance also depends on using the official codes/values required by your
// business case (tax types, payment terms, etc.). This builder focuses on the REQUIRED structural
// elements so that the XML validates against the TEIF 1.8.8 schema (withoutSig) when the required
// data is present.

export type TeifBuildInput = { invoice: any; items: any[]; company: any };

function esc(s: any) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function n3(v: any) {
  const n = Number(v ?? 0);
  if (Number.isNaN(n)) return "0.000";
  return n.toFixed(3);
}

export function getByteSizeUtf8(s: string) {
  return new TextEncoder().encode(s).byteLength;
}

export function enforceMaxSize(xml: string, maxBytes = 50 * 1024) {
  const size = getByteSizeUtf8(xml);
  return { ok: size <= maxBytes, size, maxBytes };
}

export function validateTeifMinimum(input: TeifBuildInput) {
  const { invoice, items, company } = input;
  const errors: string[] = [];

  // Company (seller)
  if (!company) errors.push("company_missing");
  if (!company?.tax_id) errors.push("company_tax_id_missing");
  if (!company?.name && !company?.company_name) errors.push("company_name_missing");
  if (!company?.address && !company?.street) errors.push("company_address_missing");

  // Invoice
  if (!invoice) errors.push("invoice_missing");
  if (!invoice?.issue_date && !invoice?.created_at) errors.push("invoice_issue_date_missing");

  // Items
  if (!Array.isArray(items) || items.length === 0) errors.push("items_missing");

  return { ok: errors.length === 0, errors };
}

/**
 * Build TEIF 1.8.8 (WITHOUT signature) with required structural sections:
 * InvoiceHeader + InvoiceBody(Bgm, Dtm, PartnerSection, LinSection, InvoiceMoa, InvoiceTax).
 *
 * PartnerDetails function codes observed in the official example:
 * - I-62: Seller (supplier)
 * - I-64: Buyer (customer)
 */
export function buildTeifV188WithoutSig(input: TeifBuildInput) {
  const { invoice, items, company } = input;

  // Identifiers (best-effort mapping)
  const sellerId = company?.tax_id || company?.ttn_sender_id || "";
  const buyerId = invoice?.customer_tax_id || invoice?.customer_identifier || invoice?.customer_id || "";

  const docId = invoice?.reference || invoice?.number || invoice?.id || "";
  const issue = invoice?.issue_date || invoice?.created_at || new Date().toISOString();

  const ddmmyy = (() => {
    const d = new Date(issue);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
  })();

  // Seller identity
  const sellerName = company?.name || company?.company_name || "";
  const sellerStreet = company?.street || company?.address || "";
  const sellerCity = company?.city || "";
  const sellerZip = company?.zip || company?.postal_code || "";

  // Buyer identity
  const buyerName = invoice?.customer_name || invoice?.client_name || invoice?.buyer_name || "";
  const buyerStreet = invoice?.customer_address || invoice?.buyer_address || "";
  const buyerCity = invoice?.customer_city || "";
  const buyerZip = invoice?.customer_zip || "";

  // Financials
  const taxRate = Number(invoice?.tax_rate ?? invoice?.vat_rate ?? 0); // % (e.g. 19)
  const currency = String(invoice?.currency || "TND");

  const lineTotals = (items || []).map((it: any, idx: number) => {
    const qty = Number(it?.qty ?? it?.quantity ?? 1);
    const unitPrice = Number(it?.unit_price ?? it?.price ?? 0);
    const total = qty * unitPrice;
    return { idx, it, qty, unitPrice, total };
  });

  const net = lineTotals.reduce((s: number, x: any) => s + (Number.isFinite(x.total) ? x.total : 0), 0);
  const tax = net * (Number.isFinite(taxRate) ? taxRate : 0) / 100;
  const gross = net + tax;

  // --- PartnerSection (seller + buyer)
  const partnerSection =
    `<PartnerSection>` +
      `<PartnerDetails functionCode="I-62">` +
        `<Nad>` +
          `<PartnerIdentifier type="I-01">${esc(sellerId)}</PartnerIdentifier>` +
          (sellerName ? `<PartnerName nameType="Qualification">${esc(sellerName)}</PartnerName>` : ``) +
          `<PartnerAdresses lang="fr">` +
            (sellerStreet ? `<Street>${esc(sellerStreet)}</Street>` : ``) +
            (sellerCity ? `<CityName>${esc(sellerCity)}</CityName>` : ``) +
            (sellerZip ? `<PostalCode>${esc(sellerZip)}</PostalCode>` : ``) +
            `<Country codeList="ISO_3166-1">TN</Country>` +
          `</PartnerAdresses>` +
        `</Nad>` +
      `</PartnerDetails>` +
      `<PartnerDetails functionCode="I-64">` +
        `<Nad>` +
          `<PartnerIdentifier type="I-01">${esc(buyerId)}</PartnerIdentifier>` +
          (buyerName ? `<PartnerName nameType="Qualification">${esc(buyerName)}</PartnerName>` : ``) +
          `<PartnerAdresses lang="fr">` +
            (buyerStreet ? `<Street>${esc(buyerStreet)}</Street>` : ``) +
            (buyerCity ? `<CityName>${esc(buyerCity)}</CityName>` : ``) +
            (buyerZip ? `<PostalCode>${esc(buyerZip)}</PostalCode>` : ``) +
            `<Country codeList="ISO_3166-1">TN</Country>` +
          `</PartnerAdresses>` +
        `</Nad>` +
      `</PartnerDetails>` +
    `</PartnerSection>`;

  // --- Lines (LinSection/Lin)
  const linSection =
    `<LinSection>` +
      lineTotals.map(({ idx, it, qty, unitPrice, total }: any) => {
        const itemCode = String(it?.code || it?.sku || it?.ref || (idx + 1));
        const desc = String(it?.label || it?.name || `Item ${idx + 1}`);

        // VAT: TaxTypeName code is "I-1602" in the official example for TVA
        const taxRateText = Number.isFinite(taxRate) ? String(taxRate) : "0";

        return (
          `<Lin>` +
            `<ItemIdentifier>${esc(itemCode)}</ItemIdentifier>` +
            `<LinImd lang="fr"><ItemCode>${esc(itemCode)}</ItemCode><ItemDescription>${esc(desc)}</ItemDescription></LinImd>` +
            `<LinQty><Quantity measurementUnit="UNIT">${esc(String(qty))}</Quantity></LinQty>` +
            `<LinTax>` +
              `<TaxTypeName code="I-1602">TVA</TaxTypeName>` +
              `<TaxDetails><TaxRate>${esc(taxRateText)}</TaxRate></TaxDetails>` +
            `</LinTax>` +
            `<LinMoa>` +
              `<MoaDetails><Moa amountTypeCode="I-183" currencyCodeList="ISO_4217"><Amount currencyIdentifier="${esc(currency)}">${n3(unitPrice)}</Amount></Moa></MoaDetails>` +
              `<MoaDetails><Moa amountTypeCode="I-171" currencyCodeList="ISO_4217"><Amount currencyIdentifier="${esc(currency)}">${n3(total)}</Amount></Moa></MoaDetails>` +
            `</LinMoa>` +
          `</Lin>`
        );
      }).join("") +
    `</LinSection>`;

  // --- InvoiceMoa totals
  const invoiceMoa =
    `<InvoiceMoa>` +
      `<AmountDetails><Moa amountTypeCode="I-176" currencyCodeList="ISO_4217"><Amount currencyIdentifier="${esc(currency)}">${n3(net)}</Amount></Moa></AmountDetails>` +
      `<AmountDetails><Moa amountTypeCode="I-181" currencyCodeList="ISO_4217"><Amount currencyIdentifier="${esc(currency)}">${n3(tax)}</Amount></Moa></AmountDetails>` +
      `<AmountDetails><Moa amountTypeCode="I-180" currencyCodeList="ISO_4217"><Amount currencyIdentifier="${esc(currency)}">${n3(gross)}</Amount></Moa></AmountDetails>` +
    `</InvoiceMoa>`;

  // --- InvoiceTax (summary)
  const invoiceTax =
    `<InvoiceTax>` +
      `<InvoiceTaxDetails>` +
        `<Tax>` +
          `<TaxTypeName code="I-1602">TVA</TaxTypeName>` +
          `<TaxDetails><TaxRate>${esc(Number.isFinite(taxRate) ? String(taxRate) : "0")}</TaxRate></TaxDetails>` +
        `</Tax>` +
        `<AmountDetails><Moa amountTypeCode="I-176" currencyCodeList="ISO_4217"><Amount currencyIdentifier="${esc(currency)}">${n3(net)}</Amount></Moa></AmountDetails>` +
        `<AmountDetails><Moa amountTypeCode="I-181" currencyCodeList="ISO_4217"><Amount currencyIdentifier="${esc(currency)}">${n3(tax)}</Amount></Moa></AmountDetails>` +
      `</InvoiceTaxDetails>` +
    `</InvoiceTax>`;

  // --- Assemble
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<TEIF controlingAgency="TTN" version="1.8.8">` +
      `<InvoiceHeader>` +
        `<MessageSenderIdentifier type="I-01">${esc(sellerId)}</MessageSenderIdentifier>` +
        `<MessageRecieverIdentifier type="I-01">${esc(buyerId)}</MessageRecieverIdentifier>` +
      `</InvoiceHeader>` +
      `<InvoiceBody>` +
        `<Bgm>` +
          `<DocumentIdentifier>${esc(docId)}</DocumentIdentifier>` +
          `<DocumentType code="I-11">Facture</DocumentType>` +
        `</Bgm>` +
        `<Dtm><DateText format="ddMMyy" functionCode="I-31">${esc(ddmmyy)}</DateText></Dtm>` +
        partnerSection +
        linSection +
        invoiceMoa +
        invoiceTax +
      `</InvoiceBody>` +
    `</TEIF>`;

  return xml;
}

// Backward-compatible names used by routes
export function buildCompactTeifXml(input: TeifBuildInput) {
  // Compact by construction: no pretty-print / whitespace.
  return buildTeifV188WithoutSig(input);
}
