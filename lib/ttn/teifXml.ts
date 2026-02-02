import { buildTeifXml, enforceMaxSize, validateTeifMinimum } from "@/lib/ttn/teif";

type BuildTeifInvoiceXmlInput = {
  company: {
    name: string;
    taxId: string;
    address?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
  invoice: {
    documentType?: string;
    number?: string;
    issueDate?: string;
    dueDate?: string;
    currency?: string;
    customerName?: string;
    customerTaxId?: string;
    customerAddress?: string;
    notes?: string;
  };
  totals: {
    ht: number;
    tva: number;
    ttc: number;
    stampEnabled?: boolean;
    stampAmount?: number;
  };
  items: Array<{
    description: string;
    qty: number;
    price: number;
    vat: number;
    discount?: number;
  }>;
  purpose?: "preview" | "ttn";
};

function s(v: any) {
  return String(v ?? "").trim();
}

export function buildTeifInvoiceXml(input: BuildTeifInvoiceXmlInput): string {
  const purpose = input.purpose ?? "preview";

  return buildTeifXml({
    invoiceId: "",
    companyId: "",
    documentType: s(input.invoice?.documentType || "facture"),
    invoiceNumber: s(input.invoice?.number || ""),
    issueDate: s(input.invoice?.issueDate || ""),
    dueDate: s(input.invoice?.dueDate || ""),
    currency: s(input.invoice?.currency || "TND"),
    notes: s(input.invoice?.notes || ""),
    purpose,
    supplier: {
      name: s(input.company?.name || ""),
      taxId: s(input.company?.taxId || ""),
      address: s(input.company?.address || ""),
      city: s(input.company?.city || ""),
      postalCode: s(input.company?.postalCode || ""),
      country: s(input.company?.country || "TN"),
    },
    customer: {
      name: s(input.invoice?.customerName || ""),
      taxId: s(input.invoice?.customerTaxId || ""),
      address: s(input.invoice?.customerAddress || ""),
    },
    totals: {
      ht: Number(input.totals?.ht ?? 0),
      tva: Number(input.totals?.tva ?? 0),
      ttc: Number(input.totals?.ttc ?? 0),
      stampEnabled: Boolean(input.totals?.stampEnabled),
      stampAmount: Number(input.totals?.stampAmount ?? 0),
    },
    items: Array.isArray(input.items)
      ? input.items.map((it) => ({
          description: s(it.description),
          qty: Number(it.qty ?? 0),
          price: Number(it.price ?? 0),
          vat: Number(it.vat ?? 0),
          discount: Number((it as any).discount ?? 0),
        }))
      : [],
  });
}

export { enforceMaxSize, validateTeifMinimum };
