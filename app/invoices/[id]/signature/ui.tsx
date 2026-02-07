"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import InvoiceSignatureClient from "./InvoiceSignatureClient";

function s(v: any) {
  return String(v ?? "").trim();
}
function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}
function clampPct(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}
function money(v: any, cur: string) {
  const x = n(v);
  return `${x.toFixed(3)} ${cur || "TND"}`;
}
function isMissing(v: any) {
  return !s(v);
}

function Line({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="text-sm font-medium text-slate-900 text-right break-words">{s(value) || "—"}</div>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-5">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-3 space-y-1">{children}</div>
    </div>
  );
}

export default function InvoiceSignatureUI({
  invoice,
  company,
  items,
  backUrl,
}: {
  invoice: any;
  company: any | null;
  items: any[];
  backUrl: string;
}) {
  const [openSign, setOpenSign] = useState(false);

  const invoiceId = useMemo(() => s(invoice?.id || ""), [invoice]);
  const currency = s(invoice?.currency || "TND");
  const invoiceNo = s(invoice?.invoice_number || invoice?.invoice_no || invoiceId);
  const issueDate = s(invoice?.issue_date);
  const dueDate = s(invoice?.due_date);
  const docType = s(invoice?.document_type || "facture");

  const stampEnabled = Boolean(invoice?.stamp_enabled);
  const stampRaw = invoice?.stamp_amount ?? invoice?.stamp_duty;
  const stampAmount = stampRaw == null ? 1 : n(stampRaw);
  const stamp = stampEnabled ? stampAmount : 0;

  const computed = useMemo(() => {
    let ht = 0;
    let tva = 0;
    let remise = 0;

    for (const it of items || []) {
      const qty = n(it.quantity ?? 0);
      const pu = n(it.unit_price_ht ?? it.unit_price ?? 0);
      const vatPct = n(it.vat_pct ?? 0);

      const base = qty * pu;

      const discPct = clampPct(n(it.discount_pct ?? it.discountPct ?? 0));
      const discAmt = n(it.discount_amount ?? it.discountAmount ?? 0);

      const lineRemise = discAmt > 0 ? discAmt : discPct > 0 ? (base * discPct) / 100 : 0;
      const lineHt = Math.max(0, base - lineRemise);

      remise += lineRemise;
      ht += lineHt;
      tva += (lineHt * vatPct) / 100;
    }

    const ttc = ht + tva + stamp;
    return { ht, tva, ttc, remise };
  }, [items, stamp]);

  const sellerName = s(company?.company_name || "");
  const sellerMf = s(company?.tax_id || company?.taxId || "");
  const sellerAdr = s(company?.address || "");
  const sellerCity = s(company?.city || "");
  const sellerZip = s(company?.postal_code || company?.zip || "");
  const sellerCountry = s(company?.country || "TN");

  const customerName = s(invoice?.customer_name || "");
  const customerMf = s(invoice?.customer_tax_id || "");
  const customerAdr = s(invoice?.customer_address || "");
  const customerEmail = s(invoice?.customer_email || "");
  const customerPhone = s(invoice?.customer_phone || "");

  const missing = useMemo(() => {
    const m: string[] = [];
    if (!invoiceId) m.push("ID facture");
    if (!sellerName) m.push("Nom société (vendeur)");
    if (!sellerMf) m.push("MF société (vendeur)");
    if (!sellerAdr) m.push("Adresse société (vendeur)");
    if (!customerName) m.push("Nom client");
    if (!customerMf) m.push("MF client");
    if (!customerAdr) m.push("Adresse client");
    if (!issueDate) m.push("Date facture");
    return m;
  }, [invoiceId, sellerName, sellerMf, sellerAdr, customerName, customerMf, customerAdr, issueDate]);

  const canStartSignature = missing.length === 0;

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-[1050px] px-4 pb-10 space-y-6 pt-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xl font-semibold">Résumé avant signature</div>
            <div className="text-sm text-slate-600 mt-1">Vérifiez les informations. Signature via DigiGo (TEIF strict).</div>
          </div>

          <div className="flex gap-2">
            <Link className="ftn-btn-ghost" href={backUrl}>
              Retour facture
            </Link>
          </div>
        </div>

        {missing.length ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="font-semibold text-amber-900">Champs manquants (bloquants)</div>
            <div className="mt-1 text-sm text-amber-800">{missing.join(" • ")}</div>
            <div className="mt-2 text-xs text-amber-700">
              Complétez ces champs dans la facture / client / société, puis relancez la signature.
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white/60 shadow-sm">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm text-slate-500">Document</div>
                <div className="text-2xl font-semibold capitalize">{docType}</div>
                <div className="mt-1 text-sm text-slate-600 break-words">
                  N° <span className="font-medium text-slate-900">{invoiceNo}</span>
                </div>
              </div>

              <div className="min-w-[260px] rounded-2xl border border-slate-200 bg-white p-4">
                <Line label="Date facture" value={issueDate} />
                <Line label="Échéance" value={dueDate} />
                <Line label="Devise" value={currency} />
              </div>
            </div>
          </div>

          <div className="p-6 grid gap-4 md:grid-cols-2">
            <Box title="Vendeur (Ma société)">
              <Line label="Nom" value={sellerName} />
              <Line label="MF" value={sellerMf} />
              <Line label="Adresse" value={sellerAdr} />
              <Line label="Ville" value={sellerCity} />
              <Line label="Code postal" value={sellerZip} />
              <Line label="Pays" value={sellerCountry} />
              {isMissing(sellerName) || isMissing(sellerMf) || isMissing(sellerAdr) ? (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  Champs vendeur requis : Nom, MF, Adresse.
                </div>
              ) : null}
            </Box>

            <Box title="Client">
              <Line label="Nom" value={customerName} />
              <Line label="MF" value={customerMf} />
              <Line label="Adresse" value={customerAdr} />
              <Line label="Email" value={customerEmail} />
              <Line label="Téléphone" value={customerPhone} />
              {isMissing(customerAdr) ? (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  Adresse client obligatoire pour la signature TTN.
                </div>
              ) : null}
            </Box>
          </div>

          <div className="px-6 pb-6">
            <div className="text-sm font-semibold text-slate-900 mb-3">Lignes</div>

            <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="text-slate-600 bg-slate-50">
                  <tr className="border-b">
                    <th className="py-3 px-4 text-left">Désignation</th>
                    <th className="py-3 px-4 text-right">Qté</th>
                    <th className="py-3 px-4 text-right">PU HT</th>
                    <th className="py-3 px-4 text-right">Remise</th>
                    <th className="py-3 px-4 text-right">TVA</th>
                    <th className="py-3 px-4 text-right">Total HT</th>
                  </tr>
                </thead>
                <tbody>
                  {(items || []).map((it, idx) => {
                    const qty = n(it.quantity ?? 0);
                    const pu = n(it.unit_price_ht ?? it.unit_price ?? 0);
                    const vat = n(it.vat_pct ?? 0);

                    const base = qty * pu;
                    const discPct = clampPct(n(it.discount_pct ?? it.discountPct ?? 0));
                    const discAmt = n(it.discount_amount ?? it.discountAmount ?? 0);
                    const lineRemise = discAmt > 0 ? discAmt : discPct > 0 ? (base * discPct) / 100 : 0;

                    const lineHt = Math.max(0, base - lineRemise);

                    const remiseLabel =
                      discAmt > 0 ? money(discAmt, currency) : discPct > 0 ? `${discPct.toFixed(2)}%` : "—";

                    return (
                      <tr key={it.id || idx} className="border-b last:border-b-0">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{s(it.description || "—")}</div>
                        </td>
                        <td className="py-3 px-4 text-right">{qty}</td>
                        <td className="py-3 px-4 text-right">{money(pu, currency)}</td>
                        <td className="py-3 px-4 text-right">{remiseLabel}</td>
                        <td className="py-3 px-4 text-right">{vat.toFixed(0)}%</td>
                        <td className="py-3 px-4 text-right font-medium">{money(lineHt, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {(items || []).map((it, idx) => {
                const qty = n(it.quantity ?? 0);
                const pu = n(it.unit_price_ht ?? it.unit_price ?? 0);
                const vat = n(it.vat_pct ?? 0);

                const base = qty * pu;
                const discPct = clampPct(n(it.discount_pct ?? it.discountPct ?? 0));
                const discAmt = n(it.discount_amount ?? it.discountAmount ?? 0);
                const lineRemise = discAmt > 0 ? discAmt : discPct > 0 ? (base * discPct) / 100 : 0;
                const lineHt = Math.max(0, base - lineRemise);

                const remiseLabel =
                  discAmt > 0 ? money(discAmt, currency) : discPct > 0 ? `${discPct.toFixed(2)}%` : "—";

                return (
                  <div key={it.id || idx} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="font-semibold text-slate-900 break-words">{s(it.description || "—")}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div className="text-slate-600">Qté</div>
                      <div className="text-right font-medium">{qty}</div>

                      <div className="text-slate-600">PU HT</div>
                      <div className="text-right font-medium">{money(pu, currency)}</div>

                      <div className="text-slate-600">Remise</div>
                      <div className="text-right font-medium">{remiseLabel}</div>

                      <div className="text-slate-600">TVA</div>
                      <div className="text-right font-medium">{vat.toFixed(0)}%</div>

                      <div className="text-slate-600">Total HT</div>
                      <div className="text-right font-semibold">{money(lineHt, currency)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="text-xs text-slate-500">Après vérification, cliquez sur “Démarrer la signature DigiGo”.</div>

              <div className="ml-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4">
                {computed.remise > 0 ? (
                  <div className="flex items-center justify-between text-sm py-1">
                    <span className="text-slate-600">Remise totale</span>
                    <span className="font-medium">-{money(computed.remise, currency)}</span>
                  </div>
                ) : null}

                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-slate-600">Total HT</span>
                  <span className="font-medium">{money(computed.ht, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-slate-600">TVA</span>
                  <span className="font-medium">{money(computed.tva, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1">
                  <span className="text-slate-600">Timbre</span>
                  <span className="font-medium">{money(stamp, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-base border-t pt-2 mt-2">
                  <span className="font-semibold">Total TTC</span>
                  <span className="font-semibold">{money(computed.ttc, currency)}</span>
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {!openSign ? (
                    <button
                      className="ftn-btn"
                      type="button"
                      onClick={() => setOpenSign(true)}
                      disabled={!canStartSignature}
                      title={!canStartSignature ? "Complétez les champs obligatoires avant de signer." : ""}
                    >
                      Démarrer la signature DigiGo
                    </button>
                  ) : (
                    <InvoiceSignatureClient invoiceId={invoiceId} backUrl={backUrl} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Important : le résumé doit correspondre exactement au TEIF signé (totaux, timbre, remise, etc.).
        </div>
      </div>
    </div>
  );
}
