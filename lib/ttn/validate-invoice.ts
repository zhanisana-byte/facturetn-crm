export type TTNLevel = "error" | "warning";
export type TTNIssue = {
  level: TTNLevel;
  code: string;
  message: string;
  field?: string;
};

export type TTNValidationResult = {
  ok: boolean; 
  errors: TTNIssue[];
  warnings: TTNIssue[];
  summary: {
    itemsCount: number;
    totals: {
      subtotal_ht: number;
      total_vat: number;
      stamp_amount: number;
      total_ttc: number;
    };
  };
};

const toNum = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const safe = (v: any) => String(v ?? "").trim();

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function almostEqual(a: number, b: number, tol = 0.005) {
  return Math.abs(a - b) <= tol;
}

export function validateInvoiceTTN(input: {
  invoice: any;
  items: any[];
  company: any;
}) : TTNValidationResult {
  const { invoice, items, company } = input;

  const errors: TTNIssue[] = [];
  const warnings: TTNIssue[] = [];

  const docType = safe(invoice?.document_type || "facture");
  const invNumber = safe(invoice?.invoice_number || invoice?.invoice_no || "");
  const issueDate = safe(invoice?.issue_date || invoice?.created_at || "").slice(0, 10);
  const currency = safe(invoice?.currency || "TND");

  if (!invNumber) errors.push({ level: "error", code: "INV_NUMBER_MISSING", message: "Numéro de facture manquant.", field: "invoice_number" });
  if (!issueDate) errors.push({ level: "error", code: "ISSUE_DATE_MISSING", message: "Date de facture manquante.", field: "issue_date" });

  const sellerName = safe(company?.company_name || "");
  const sellerMF = safe(company?.tax_id || "");
  const sellerAdr = safe(company?.address || "");

  if (!sellerName) errors.push({ level: "error", code: "SELLER_NAME_MISSING", message: "Nom société (vendeur) manquant.", field: "companies.company_name" });
  if (!sellerMF) errors.push({ level: "error", code: "SELLER_MF_MISSING", message: "Matricule fiscal vendeur (MF) manquant.", field: "companies.tax_id" });
  if (!sellerAdr) warnings.push({ level: "warning", code: "SELLER_ADDRESS_MISSING", message: "Adresse vendeur non renseignée (recommandé).", field: "companies.address" });

  const buyerName = safe(invoice?.customer_name || "");
  const buyerMF = safe(invoice?.customer_tax_id || "");
  const buyerAdr = safe(invoice?.customer_address || "");

  if (!buyerName) errors.push({ level: "error", code: "BUYER_NAME_MISSING", message: "Nom client manquant.", field: "invoices.customer_name" });

  if (!buyerMF) warnings.push({ level: "warning", code: "BUYER_MF_MISSING", message: "MF client vide (si B2B, c'est généralement requis).", field: "invoices.customer_tax_id" });
  if (!buyerAdr) warnings.push({ level: "warning", code: "BUYER_ADDRESS_MISSING", message: "Adresse client non renseignée (recommandé).", field: "invoices.customer_address" });

  const arr = Array.isArray(items) ? items : [];
  if (arr.length === 0) errors.push({ level: "error", code: "ITEMS_EMPTY", message: "La facture doit contenir au moins une ligne.", field: "invoice_items" });

  let calc_ht = 0;
  let calc_vat = 0;
  let calc_ttc = 0;

  for (let i = 0; i < arr.length; i++) {
    const it = arr[i];
    const lineNo = it?.line_no ?? (i + 1);

    const desc = safe(it?.description || it?.name || "");
    const qty = toNum(it?.quantity);
    const pu = toNum(it?.unit_price_ht ?? it?.unit_price);
    const vatPct = toNum(it?.vat_pct ?? it?.vat);

    if (!desc) errors.push({ level: "error", code: "ITEM_DESC_MISSING", message: `Ligne ${lineNo}: description manquante.`, field: `invoice_items[${i}].description` });
    if (!(qty > 0)) errors.push({ level: "error", code: "ITEM_QTY_INVALID", message: `Ligne ${lineNo}: quantité invalide (doit être > 0).`, field: `invoice_items[${i}].quantity` });
    if (!(pu >= 0)) errors.push({ level: "error", code: "ITEM_PU_INVALID", message: `Ligne ${lineNo}: PU invalide.`, field: `invoice_items[${i}].unit_price_ht` });

    if (vatPct < 0 || vatPct > 100) errors.push({ level: "error", code: "ITEM_VAT_INVALID", message: `Ligne ${lineNo}: taux TVA invalide.`, field: `invoice_items[${i}].vat_pct` });

    const ht = round3(toNum(it?.line_total_ht ?? (qty * pu)));
    const vatAmt = round3(ht * (vatPct / 100));
    const ttc = round3(ht + vatAmt);

    calc_ht = round3(calc_ht + ht);
    calc_vat = round3(calc_vat + vatAmt);
    calc_ttc = round3(calc_ttc + ttc);

    if (it?.line_total_ht != null) {
      const stored = round3(toNum(it.line_total_ht));
      if (!almostEqual(stored, ht)) {
        warnings.push({
          level: "warning",
          code: "ITEM_HT_MISMATCH",
          message: `Ligne ${lineNo}: HT stocké (${stored}) ≠ calculé (${ht}).`,
          field: `invoice_items[${i}].line_total_ht`,
        });
      }
    }
  }

  const inv_subtotal_ht = round3(toNum(invoice?.total_ht ?? invoice?.subtotal_ht));
  const inv_total_vat = round3(toNum(invoice?.total_vat ?? invoice?.total_tax));
  const stamp_enabled = Boolean(invoice?.stamp_enabled);
  const stamp_amount = round3(toNum(invoice?.stamp_amount));
  const inv_total_ttc = round3(toNum(invoice?.total_ttc ?? (inv_subtotal_ht + inv_total_vat + (stamp_enabled ? stamp_amount : 0))));

  if (!inv_subtotal_ht && calc_ht > 0) warnings.push({ level: "warning", code: "TOTAL_HT_EMPTY", message: "total_ht/subtotal_ht est vide: on utilisera le calcul des lignes.", field: "invoices.total_ht" });
  if (!inv_total_vat && calc_vat > 0) warnings.push({ level: "warning", code: "TOTAL_VAT_EMPTY", message: "total_vat est vide: on utilisera le calcul des lignes.", field: "invoices.total_vat" });

  if (inv_subtotal_ht > 0 && !almostEqual(inv_subtotal_ht, calc_ht)) {
    errors.push({
      level: "error",
      code: "TOTAL_HT_MISMATCH",
      message: `Total HT incohérent: facture (${inv_subtotal_ht}) ≠ lignes (${calc_ht}).`,
      field: "invoices.total_ht",
    });
  }

  if (inv_total_vat > 0 && !almostEqual(inv_total_vat, calc_vat)) {
    errors.push({
      level: "error",
      code: "TOTAL_VAT_MISMATCH",
      message: `Total TVA incohérent: facture (${inv_total_vat}) ≠ lignes (${calc_vat}).`,
      field: "invoices.total_vat",
    });
  }

  if (stamp_enabled && stamp_amount <= 0) {
    warnings.push({ level: "warning", code: "STAMP_ENABLED_ZERO", message: "Timbre activé mais montant = 0.", field: "invoices.stamp_amount" });
  }
  if (!stamp_enabled && stamp_amount > 0) {
    warnings.push({ level: "warning", code: "STAMP_AMOUNT_WITHOUT_FLAG", message: "Montant timbre > 0 mais stamp_enabled=false.", field: "invoices.stamp_enabled" });
  }

  const calc_total_with_stamp = round3(calc_ttc + (stamp_enabled ? stamp_amount : 0));
  if (invoice?.total_ttc != null) {
    if (!almostEqual(inv_total_ttc, calc_total_with_stamp)) {
      errors.push({
        level: "error",
        code: "TOTAL_TTC_MISMATCH",
        message: `Total TTC incohérent: facture (${inv_total_ttc}) ≠ lignes+TVA+timbre (${calc_total_with_stamp}).`,
        field: "invoices.total_ttc",
      });
    }
  } else {
    warnings.push({ level: "warning", code: "TOTAL_TTC_EMPTY", message: "total_ttc vide: on utilisera le calcul.", field: "invoices.total_ttc" });
  }

  if (!currency) warnings.push({ level: "warning", code: "CURRENCY_EMPTY", message: "Devise vide (recommandé: TND).", field: "invoices.currency" });

  const allowed = ["facture", "devis", "avoir"];
  if (!allowed.includes(docType.toLowerCase())) {
    warnings.push({ level: "warning", code: "DOC_TYPE_UNKNOWN", message: `document_type '${docType}' non standard.`, field: "invoices.document_type" });
  }

  const ok = errors.length === 0;

  return {
    ok,
    errors,
    warnings,
    summary: {
      itemsCount: arr.length,
      totals: {
        subtotal_ht: round3(calc_ht),
        total_vat: round3(calc_vat),
        stamp_amount: stamp_enabled ? stamp_amount : 0,
        total_ttc: round3(calc_total_with_stamp),
      },
    },
  };
}
