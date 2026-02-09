export function buildInvoiceXML(invoice: any) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <InvoiceNumber>${invoice.number}</InvoiceNumber>
  <InvoiceDate>${invoice.date}</InvoiceDate>

  <Seller>
    <Name>${invoice.company.name}</Name>
    <MF>${invoice.company.mf}</MF>
    <Address>${invoice.company.address}</Address>
  </Seller>

  <Buyer>
    <Name>${invoice.client.name}</Name>
    <MF>${invoice.client.mf}</MF>
    <Address>${invoice.client.address}</Address>
  </Buyer>

  <Lines>
    ${invoice.items
      .map(
        (item: any, i: number) => `
      <Line>
        <ID>${i + 1}</ID>
        <Description>${item.label}</Description>
        <Quantity>${item.qty}</Quantity>
        <UnitPrice>${item.price}</UnitPrice>
        <Total>${item.total}</Total>
      </Line>`
      )
      .join("")}
  </Lines>

  <Totals>
    <HT>${invoice.total_ht}</HT>
    <TVA>${invoice.total_tva}</TVA>
    <TTC>${invoice.total_ttc}</TTC>
  </Totals>

  <Currency>TND</Currency>
</Invoice>`;
}
