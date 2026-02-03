export type TeifBuildInput = {
  invoiceId: string;
  companyId: string;

  documentType?: "facture" | "avoir" | "devis" | string | null;

  invoiceNumber?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;

  currency?: string | null;

  customer?: {
    name?: string | null;
    taxId?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;

  supplier?: {
    name?: string | null;
    taxId?: string | null;
    address?: string | null;
    street?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
  } | null;

  totals?: {
    ht: number;
    tva: number;
    ttc: number;
    stampEnabled?: boolean;
    stampAmount?: number;
  } | null;

  notes?: string | null;

  purpose?: "preview" | "ttn" | null;

  items?: Array<{
    description: string;
    qty: number;
    price: number;
    vat: number;
    discount?: number;
  }>;
};

function escXml(v: unknown): string {
  const s = String(v ?? "");
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toNum(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function fmtAmount(n: unknown): string {
  const x = toNum(n);
  return x.toFixed(3);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDdMmYy(d: string | null | undefined): string {
  const s = String(d ?? "").trim();
  if (!s) return "";
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "";
  const dd = pad2(dt.getDate());
  const mm = pad2(dt.getMonth() + 1);
  const yy = pad2(dt.getFullYear() % 100);
  return `${dd}${mm}${yy}`;
}

function requireNonEmpty(label: string, v: string) {
  const x = (v ?? "").trim();
  if (!x) throw new Error(`${label} manquant`);
  return x;
}

function nonEmpty(v: unknown): string {
  return String(v ?? "").trim();
}

export function buildTeifXml(input: TeifBuildInput): string {
  const purpose = (input.purpose ?? "preview") as "preview" | "ttn";
  const docKind = String(input.documentType ?? "facture").toLowerCase();
  const requireStrict = purpose === "ttn" && docKind !== "devis";

  const currency = (input.currency ?? "TND").toUpperCase();

  const invoiceNumberRaw = nonEmpty(input.invoiceNumber || "");
  const invoiceNumber = requireStrict
    ? requireNonEmpty("Le numéro de facture", invoiceNumberRaw)
    : nonEmpty(invoiceNumberRaw || input.invoiceId);

  const issueDd = toDdMmYy(input.issueDate);
  const dueDd = toDdMmYy(input.dueDate);

  const supplierName = nonEmpty(input.supplier?.name || "");
  const supplierTax = nonEmpty(input.supplier?.taxId || "");
  const supplierAddr = nonEmpty(input.supplier?.address || "");

  if (requireStrict) {
    requireNonEmpty("Le matricule fiscal (MF) de la société", supplierTax);
    requireNonEmpty("Le nom de la société", supplierName);
    requireNonEmpty("L’adresse de la société", supplierAddr);
    if (!issueDd) throw new Error("La date de facture est invalide");
  }

  const supplierStreet = nonEmpty(input.supplier?.street || "");
  const supplierCity = nonEmpty(input.supplier?.city || "");
  const supplierPostal = nonEmpty(input.supplier?.postalCode || "");
  const supplierCountry = nonEmpty(input.supplier?.country || "TN").toUpperCase() || "TN";

  const customerNameRaw = nonEmpty(input.customer?.name || "");
  const customerName = requireStrict ? requireNonEmpty("Le nom du client", customerNameRaw) : nonEmpty(customerNameRaw || "Client");

  const customerTaxRaw = nonEmpty(input.customer?.taxId || "");
  const customerTax = requireStrict ? requireNonEmpty("Le matricule fiscal (MF) du client", customerTaxRaw) : nonEmpty(customerTaxRaw || "NA");

  const customerAddrRaw = nonEmpty(input.customer?.address || "");
  const customerAddr = requireStrict ? requireNonEmpty("L’adresse du client", customerAddrRaw) : customerAddrRaw;

  const customerCity = nonEmpty(input.customer?.city || "");
  const customerPostal = nonEmpty(input.customer?.postalCode || "");
  const customerCountry = nonEmpty(input.customer?.country || "TN").toUpperCase() || "TN";

  const ht = toNum(input.totals?.ht);
  const tva = toNum(input.totals?.tva);
  const ttc = toNum(input.totals?.ttc);

  const stampEnabled = Boolean(input.totals?.stampEnabled);
  const stampAmount = toNum(input.totals?.stampAmount);

  const notes = nonEmpty(input.notes || "");
  const items = Array.isArray(input.items) ? input.items : [];

  if (requireStrict) {
    if (items.length < 1) throw new Error("Au moins une ligne est obligatoire");
    for (const it of items) {
      const d = nonEmpty(it.description);
      if (!d) throw new Error("Description de ligne manquante");
      const q = toNum(it.qty);
      if (q <= 0) throw new Error("Quantité invalide");
    }
  }

  const linesXml = items
    .map((it, idx) => {
      const qty = toNum(it.qty);
      const price = toNum(it.price);
      const vat = toNum(it.vat);

      const discountPct = toNum((it as any).discount ?? 0);
      const disc = Math.min(Math.max(discountPct, 0), 100) / 100;
      const lineHt = qty * price * (1 - disc);

      return `
      <Lin>
        <ItemIdentifier>${escXml(String(idx + 1))}</ItemIdentifier>
        <LinImd>
          <ItemCode>${escXml(String(idx + 1))}</ItemCode>
          <ItemDescription>${escXml(it.description || "")}</ItemDescription>
        </LinImd>
        <LinQty>
          <Quantity measurementUnit="C62">${escXml(String(qty || 1))}</Quantity>
        </LinQty>
        <LinTax>
          <TaxTypeName code="I-1602">TVA</TaxTypeName>
          <TaxDetails>
            <TaxRate>${escXml(String(vat || 0))}</TaxRate>
          </TaxDetails>
        </LinTax>
        <LinMoa>
          <MoaDetails>
            <Moa amountTypeCode="I-183" currencyCodeList="ISO_4217">
              <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(price))}</Amount>
            </Moa>
          </MoaDetails>
          <MoaDetails>
            <Moa amountTypeCode="I-171" currencyCodeList="ISO_4217">
              <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(lineHt))}</Amount>
            </Moa>
          </MoaDetails>
        </LinMoa>
      </Lin>`;
    })
    .join("");

  const partnerSupplier = `
      <PartnerDetails functionCode="I-62">
        <Nad>
          <PartnerIdentifier type="I-01">${escXml(supplierTax || "NA")}</PartnerIdentifier>
          <PartnerName nameType="Qualification">${escXml(supplierName || "Société")}</PartnerName>
          <PartnerAdresses lang="fr">
            <AdressDescription>${escXml(supplierAddr)}</AdressDescription>
            <Street>${escXml(supplierStreet)}</Street>
            <CityName>${escXml(supplierCity)}</CityName>
            <PostalCode>${escXml(supplierPostal)}</PostalCode>
            <Country codeList="ISO_3166-1">${escXml(supplierCountry)}</Country>
          </PartnerAdresses>
        </Nad>
      </PartnerDetails>`;

  const partnerCustomer = `
      <PartnerDetails functionCode="I-64">
        <Nad>
          <PartnerIdentifier type="I-01">${escXml(customerTax)}</PartnerIdentifier>
          <PartnerName nameType="Qualification">${escXml(customerName)}</PartnerName>
          <PartnerAdresses lang="fr">
            <AdressDescription>${escXml(customerAddr)}</AdressDescription>
            <Street></Street>
            <CityName>${escXml(customerCity)}</CityName>
            <PostalCode>${escXml(customerPostal)}</PostalCode>
            <Country codeList="ISO_3166-1">${escXml(customerCountry)}</Country>
          </PartnerAdresses>
        </Nad>
      </PartnerDetails>`;

  const invoiceMoa = `
    <InvoiceMoa>
      <AmountDetails>
        <Moa amountTypeCode="I-176" currencyCodeList="ISO_4217">
          <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(ht))}</Amount>
        </Moa>
      </AmountDetails>
      <AmountDetails>
        <Moa amountTypeCode="I-182" currencyCodeList="ISO_4217">
          <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(ht))}</Amount>
        </Moa>
      </AmountDetails>
      <AmountDetails>
        <Moa amountTypeCode="I-181" currencyCodeList="ISO_4217">
          <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(tva))}</Amount>
        </Moa>
      </AmountDetails>
      <AmountDetails>
        <Moa amountTypeCode="I-180" currencyCodeList="ISO_4217">
          <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(ttc))}</Amount>
        </Moa>
      </AmountDetails>
    </InvoiceMoa>`;

  const vatMap = new Map<number, { base: number; tax: number }>();
  for (const it of items) {
    const qty = toNum((it as any).qty);
    const price = toNum((it as any).price);
    const discountPct = toNum((it as any).discount ?? 0);
    const disc = Math.min(Math.max(discountPct, 0), 100) / 100;
    const vatRate = toNum((it as any).vat);
    const lineBase = qty * price * (1 - disc);
    const lineTax = lineBase * (vatRate / 100);
    const key = Number.isFinite(vatRate) ? vatRate : 0;
    const prev = vatMap.get(key) ?? { base: 0, tax: 0 };
    vatMap.set(key, { base: prev.base + lineBase, tax: prev.tax + lineTax });
  }

  const vatRates = Array.from(vatMap.keys()).sort((a, b) => a - b);
  if (vatRates.length === 0) vatRates.push(0);

  const vatTax = vatRates
    .map((rate) => {
      const agg = vatMap.get(rate) ?? { base: ht, tax: tva };
      return `
      <InvoiceTaxDetails>
        <Tax>
          <TaxTypeName code="I-1602">TVA</TaxTypeName>
          <TaxDetails>
            <TaxRate>${escXml(String(rate))}</TaxRate>
          </TaxDetails>
        </Tax>
        <AmountDetails>
          <Moa amountTypeCode="I-177" currencyCodeList="ISO_4217">
            <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(agg.base))}</Amount>
          </Moa>
        </AmountDetails>
        <AmountDetails>
          <Moa amountTypeCode="I-178" currencyCodeList="ISO_4217">
            <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(agg.tax))}</Amount>
          </Moa>
        </AmountDetails>
      </InvoiceTaxDetails>`;
    })
    .join("");

  const stampTax = stampEnabled
    ? `
      <InvoiceTaxDetails>
        <Tax>
          <TaxTypeName code="I-1601">droit de timbre</TaxTypeName>
          <TaxDetails>
            <TaxRate>0</TaxRate>
          </TaxDetails>
        </Tax>
        <AmountDetails>
          <Moa amountTypeCode="I-178" currencyCodeList="ISO_4217">
            <Amount currencyIdentifier="${escXml(currency)}">${escXml(fmtAmount(stampAmount))}</Amount>
          </Moa>
        </AmountDetails>
      </InvoiceTaxDetails>`
    : "";

  const invoiceTax = `
    <InvoiceTax>
      ${stampTax}
      ${vatTax}
    </InvoiceTax>`;

  const ftx = notes
    ? `
    <Ftx>
      <FtxDetail functionCode="I-451">
        <Text lang="fr">${escXml(notes)}</Text>
      </FtxDetail>
    </Ftx>`
    : "";

  const dtm = `
    <Dtm>
      <DateText format="ddMMyy" functionCode="I-31">${escXml(issueDd)}</DateText>
      ${dueDd ? `<DateText format="ddMMyy" functionCode="I-32">${escXml(dueDd)}</DateText>` : ""}
    </Dtm>`;

  const docTypeCode = docKind === "avoir" ? "I-12" : "I-11";
  const docTypeLabel = docKind === "avoir" ? "Facture d’avoir" : "Facture";

  const bgm = `
    <Bgm>
      <DocumentIdentifier>${escXml(invoiceNumber)}</DocumentIdentifier>
      <DocumentType code="${escXml(docTypeCode)}">${escXml(docTypeLabel)}</DocumentType>
    </Bgm>`;

  const header = `
  <InvoiceHeader>
    <MessageSenderIdentifier type="I-01">${escXml(supplierTax || "NA")}</MessageSenderIdentifier>
    <MessageRecieverIdentifier type="I-01">${escXml(customerTax || "NA")}</MessageRecieverIdentifier>
  </InvoiceHeader>`;

  const body = `
  <InvoiceBody>
    ${bgm}
    ${dtm}
    <PartnerSection>
      ${partnerSupplier}
      ${partnerCustomer}
    </PartnerSection>
    ${ftx}
    <LinSection>
      ${linesXml}
    </LinSection>
    ${invoiceMoa}
    ${invoiceTax}
  </InvoiceBody>`;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<TEIF controlingAgency="TTN" version="1.8.8">` +
    `${header}` +
    `${body}` +
    `</TEIF>`
  );
}

export function buildCompactTeifXml(input: TeifBuildInput) {
  return buildTeifXml(input);
}

export function validateTeifMinimum(xml: string): string[] {
  const problems: string[] = [];

  if (!xml.includes("<TEIF")) problems.push("Missing <TEIF> root");
  if (!xml.includes('controlingAgency="TTN"')) problems.push('Missing controlingAgency="TTN"');
  if (!xml.includes('version="1.8.8"')) problems.push('Missing version="1.8.8"');
  if (!xml.includes("<InvoiceHeader>")) problems.push("Missing <InvoiceHeader>");
  if (!xml.includes("<InvoiceBody>")) problems.push("Missing <InvoiceBody>");
  if (!xml.includes("<Bgm>")) problems.push("Missing <Bgm>");
  if (!xml.includes("<DocumentIdentifier>")) problems.push("Missing DocumentIdentifier");
  if (!xml.match(/<DocumentIdentifier>\s*[^<\s][^<]*<\/DocumentIdentifier>/)) problems.push("Empty DocumentIdentifier");

  if (!xml.includes("<Dtm>")) problems.push("Missing <Dtm>");
  const issueMatch = xml.match(/functionCode="I-31"[^>]*>([^<]+)</);
  if (!issueMatch) problems.push("Missing IssueDate (I-31)");
  else if (!/^\d{6}$/.test(issueMatch[1].trim())) problems.push("Invalid IssueDate format (expected ddMMyy)");

  if (!xml.includes("<PartnerSection>")) problems.push("Missing PartnerSection");
  if (!xml.includes('functionCode="I-62"')) problems.push("Missing Supplier partner (I-62)");
  if (!xml.includes('functionCode="I-64"')) problems.push("Missing Customer partner (I-64)");

  if (!xml.match(/functionCode="I-62"[\s\S]*?<PartnerIdentifier[^>]*>\s*[^<\s][^<]*<\/PartnerIdentifier>/))
    problems.push("Missing/empty Supplier PartnerIdentifier");
  if (!xml.match(/functionCode="I-64"[\s\S]*?<PartnerIdentifier[^>]*>\s*[^<\s][^<]*<\/PartnerIdentifier>/))
    problems.push("Missing/empty Customer PartnerIdentifier");

  if (!xml.includes("<LinSection>")) problems.push("Missing LinSection");
  const lineCount = (xml.match(/<Lin>/g) || []).length;
  if (lineCount < 1) problems.push("Missing at least one line");

  if (!xml.includes("<InvoiceMoa>")) problems.push("Missing InvoiceMoa totals");
  if (!xml.includes("<InvoiceTax>")) problems.push("Missing InvoiceTax");
  if (!xml.includes('TaxTypeName code="I-1602"')) problems.push("Missing VAT tax block (I-1602)");

  if (!xml.includes('amountTypeCode="I-171"')) problems.push("Missing line total HT (I-171)");
  if (!xml.includes('amountTypeCode="I-183"')) problems.push("Missing unit HT price (I-183)");
  if (!xml.includes('amountTypeCode="I-176"')) problems.push("Missing invoice total HT (I-176)");
  if (!xml.includes('amountTypeCode="I-182"')) problems.push("Missing invoice total base taxe (I-182)");
  if (!xml.includes('amountTypeCode="I-181"')) problems.push("Missing invoice total taxe (I-181)");
  if (!xml.includes('amountTypeCode="I-180"')) problems.push("Missing invoice total TTC (I-180)");

  return problems;
}

export function enforceMaxSize(xml: string, maxBytes = 50_000) {
  const originalSize = Buffer.byteLength(xml, "utf8");
  if (originalSize <= maxBytes) {
    return { xml, originalSize, finalSize: originalSize, trimmed: false };
  }

  let trimmedXml = xml.replace(/<Ftx>[\s\S]*?<\/Ftx>/g, "");
  const finalSize = Buffer.byteLength(trimmedXml, "utf8");
  if (finalSize <= maxBytes) {
    return { xml: trimmedXml, originalSize, finalSize, trimmed: true };
  }

  trimmedXml = trimmedXml.replace(/<AmountDescription[\s\S]*?<\/AmountDescription>/g, "");
  return {
    xml: trimmedXml,
    originalSize,
    finalSize: Buffer.byteLength(trimmedXml, "utf8"),
    trimmed: true,
  };
}
