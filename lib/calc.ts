export type ItemInput = {
  quantity: number;
  unit_price_ht: number;
  discount_pct?: number; // 0..100
  vat_pct: number;       // ex: 0, 7, 13, 19
};

export function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function calcLine(i: ItemInput) {
  const q = i.quantity || 0;
  const pu = i.unit_price_ht || 0;
  const disc = (i.discount_pct || 0) / 100;
  const htBefore = q * pu;
  const ht = htBefore * (1 - disc);
  const vat = ht * (i.vat_pct / 100);
  const ttc = ht + vat;
  return {
    line_total_ht: round3(ht),
    line_vat_amount: round3(vat),
    line_total_ttc: round3(ttc),
  };
}

export function calcTotals(lines: Array<ReturnType<typeof calcLine>>) {
  const subtotal_ht = round3(lines.reduce((s, x) => s + x.line_total_ht, 0));
  const total_vat = round3(lines.reduce((s, x) => s + x.line_vat_amount, 0));
  const total_ttc = round3(lines.reduce((s, x) => s + x.line_total_ttc, 0));
  return { subtotal_ht, total_vat, total_ttc };
}
