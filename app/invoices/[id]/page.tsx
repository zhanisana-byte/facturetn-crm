import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import InvoiceActions from "./InvoiceActions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function fmt3(v: any) {
  const x = n(v);
  return (Math.round(x * 1000) / 1000).toFixed(3);
}

function clampPct(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}

function pickDiscount(it: any) {
  const pct = clampPct(n(it.discount_pct ?? it.discountPct ?? it.remise_pct ?? it.remisePct ?? it.discount_percent ?? it.discountPercent ?? 0));
  const amt = n(it.discount_amount ?? it.discountAmount ?? it.remise_amount ?? it.remiseAmount ?? 0);
  return { pct, amt };
}

function badge(kind: "draft" | "signed" | "pending" | "sent" | "err") {
  if (kind === "signed") return "bg-emerald-50 border-emerald-200 text-emerald-800";
  if (kind === "pending") return "bg-amber-50 border-amber-200 text-amber-800";
  if (kind === "sent") return "bg-sky-50 border-sky-200 text-sky-800";
  if (kind === "err") return "bg-rose-50 border-rose-200 text-rose-800";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: sess } = await supabase.auth.getSession();
  const user = sess.session?.user;
  if (!user) redirect("/login");

  const invoiceId = s(params?.id);
  if (!invoiceId) notFound();

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
  if (!invoice) notFound();

  const { data: company } = await supabase.from("companies").select("*").eq("id", (invoice as any).company_id).maybeSingle();

  const { data: items } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_no", { ascending: true });

  const invoiceNo = s((invoice as any).invoice_number || "");
  const docType = s((invoice as any).document_type || "facture");
  const issueDate = s((invoice as any).issue_date || "");
  const dueDate = s((invoice as any).due_date || "");
  const currency = s((invoice as any).currency || "TND");
  const notes = s((invoice as any).notes || "");

  const signatureStatus = s((invoice as any).signature_status || "not_signed");
  const invoiceSigned = signatureStatus === "signed";
  const ttnStatus = s((invoice as any).ttn_status || "not_sent");

  const headBadge = invoiceSigned
    ? { label: "Signée", kind: "signed" as const }
    : ttnStatus === "pending_signature"
    ? { label: "En attente signature", kind: "pending" as const }
    : { label: "Brouillon", kind: "draft" as const };

  const stamp = (invoice as any).stamp_amount ?? (invoice as any).stamp_duty ?? 1;

  return (
    <AppShell title="Facture" subtitle="Résumé" accountType="profil">
      <div className="ftn-page pb-10">
        <div className="ftn-page-head">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="ftn-h1">
                {docType.toUpperCase()} {invoiceNo ? `• ${invoiceNo}` : ""}
              </h1>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Date: {issueDate || "—"} • Devise: {currency}
              </div>
            </div>
            <div className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-xs ${badge(headBadge.kind)}`}>
              {headBadge.label}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link className="ftn-btn ftn-btn-ghost" href="/invoices">
              Retour
            </Link>

            <a className="ftn-btn ftn-btn-ghost" href={`/api/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer">
              Télécharger PDF
            </a>

            <a className="ftn-btn ftn-btn-ghost" href={`/api/invoices/${invoiceId}/xml`} target="_blank" rel="noreferrer">
              Télécharger XML (TEIF)
            </a>

            <a
              className={`ftn-btn ftn-btn-ghost ${invoiceSigned ? "" : "opacity-50 pointer-events-none"}`}
              href={`/api/invoices/${invoiceId}/xml-signed`}
              target="_blank"
              rel="noreferrer"
            >
              Télécharger XML (signé)
            </a>

            <Link className="ftn-btn" href={`/invoices/${invoiceId}/signature?back=${encodeURIComponent(`/invoices/${invoiceId}`)}`}>
              Voir facture pour signer
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="ftn-card p-5 lg:col-span-2">
            <div className="ftn-section-title">Client</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="text-xs text-[var(--muted)]">Nom</div>
                <div className="text-sm font-medium">{s((invoice as any).customer_name) || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)]">MF</div>
                <div className="text-sm font-medium">{s((invoice as any).customer_tax_id) || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)]">Email</div>
                <div className="text-sm font-medium">{s((invoice as any).customer_email) || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)]">Téléphone</div>
                <div className="text-sm font-medium">{s((invoice as any).customer_phone) || "—"}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs text-[var(--muted)]">Adresse</div>
                <div className="text-sm font-medium">{s((invoice as any).customer_address) || "—"}</div>
              </div>
            </div>
          </div>

          <div className="ftn-card p-5">
            <div className="ftn-section-title">Vendeur</div>
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <div className="text-xs text-[var(--muted)]">Société</div>
                <div className="text-sm font-medium">{s((company as any)?.company_name) || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)]">MF</div>
                <div className="text-sm font-medium">{s((company as any)?.tax_id || (company as any)?.taxId) || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)]">Adresse</div>
                <div className="text-sm font-medium">{s((company as any)?.address) || "—"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="ftn-card p-5 mt-4">
          <div className="ftn-section-title">Lignes</div>

          <div className="mt-4 overflow-x-auto">
            <table className="ftn-table">
              <thead>
                <tr>
                  <th style={{ width: 52 }}>#</th>
                  <th>Description</th>
                  <th style={{ width: 110 }}>Qté</th>
                  <th style={{ width: 130 }}>PU HT</th>
                  <th style={{ width: 120 }}>Remise</th>
                  <th style={{ width: 110 }}>TVA%</th>
                  <th style={{ width: 130 }}>Total HT</th>
                  <th style={{ width: 130 }}>Total TTC</th>
                </tr>
              </thead>
              <tbody>
                {(items || []).map((it: any, idx: number) => {
                  const d = pickDiscount(it);
                  const hasPct = d.pct > 0;
                  const hasAmt = d.amt > 0;
                  const rem = hasAmt ? `-${fmt3(d.amt)}` : hasPct ? `-${fmt3(d.pct)}%` : "—";

                  return (
                    <tr key={it.id || idx}>
                      <td>{it.line_no ?? idx + 1}</td>
                      <td>
                        <div className="font-medium">{s(it.description) || "—"}</div>
                        {hasPct || hasAmt ? <div className="text-xs text-[var(--muted)] mt-0.5">Remise appliquée</div> : null}
                      </td>
                      <td>{fmt3(it.quantity)}</td>
                      <td>{fmt3(it.unit_price_ht)}</td>
                      <td>{rem}</td>
                      <td>{fmt3(it.vat_pct)}</td>
                      <td>{fmt3(it.line_total_ht)}</td>
                      <td>{fmt3(it.line_total_ttc)}</td>
                    </tr>
                  );
                })}

                {!items?.length ? (
                  <tr>
                    <td colSpan={8} className="text-center text-sm text-[var(--muted)] py-6">
                      Aucune ligne.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2" />

            <div className="ftn-card p-5">
              <div className="ftn-section-title">Totaux</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Total HT</span>
                  <span className="font-medium">{fmt3((invoice as any).subtotal_ht)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Total TVA</span>
                  <span className="font-medium">{fmt3((invoice as any).total_vat ?? (invoice as any).total_tva)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--muted)]">Timbre</span>
                  <span className="font-medium">{fmt3(stamp)}</span>
                </div>
                <div className="mt-2 pt-2 border-t border-[var(--border)] flex justify-between">
                  <span className="font-semibold">Net à payer</span>
                  <span className="font-semibold">{fmt3((invoice as any).net_to_pay)}</span>
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-[var(--border)]">
                <div className="text-xs text-[var(--muted)]">Échéance</div>
                <div className="text-sm font-medium">{dueDate || "—"}</div>
                <div className="text-xs text-[var(--muted)] mt-3">Notes</div>
                <div className="text-sm font-medium">{notes || "—"}</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <InvoiceActions invoiceId={invoiceId} invoiceSigned={invoiceSigned} signatureRequired />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
