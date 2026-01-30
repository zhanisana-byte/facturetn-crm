"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Company = { id: string; company_name: string };

type ItemRow = {
  id?: string;
  line_no: number;
  description: string;
  quantity: number;
  unit_price_ht: number;
  vat_pct: number;
  discount_pct: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function iso4217OK(v: string) {
  const s = (v || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s);
}

function toNum(v: any, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export default function NewInvoiceClient({ companies }: { companies: Company[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Société
  const [companyId, setCompanyId] = useState<string>(companies?.[0]?.id ?? "");

  // Client
  const [clientName, setClientName] = useState("");
  const [clientVat, setClientVat] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");

  // Doc
  const [issueDate, setIssueDate] = useState(todayISO());
  const [currency, setCurrency] = useState("TND");

  // Timbre fiscal (Tunisie)
  const [stampAmount, setStampAmount] = useState<number>(1.0);
  const stampEnabled = true;

  // Lignes
  const [rows, setRows] = useState<ItemRow[]>([
    { line_no: 1, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 },
  ]);

  const [err, setErr] = useState<string | null>(null);

  const totals = useMemo(() => {
    let subtotal_ht = 0;
    let total_vat = 0;

    for (const r of rows) {
      const qty = toNum(r.quantity, 0);
      const pu = toNum(r.unit_price_ht, 0);
      const vat = toNum(r.vat_pct, 0);
      const disc = toNum(r.discount_pct, 0);

      const line_ht = qty * pu;
      const line_disc = line_ht * (disc / 100);
      const net_ht = line_ht - line_disc;

      subtotal_ht += net_ht;
      total_vat += net_ht * (vat / 100);
    }

    subtotal_ht = round3(subtotal_ht);
    total_vat = round3(total_vat);

    const total_ttc_no_stamp = round3(subtotal_ht + total_vat);
    const stamp = stampEnabled ? round3(toNum(stampAmount, 0)) : 0;
    const total_ttc = round3(total_ttc_no_stamp + stamp);

    return { subtotal_ht, total_vat, stamp, total_ttc, total_ttc_no_stamp };
  }, [rows, stampAmount]);

  function addLine() {
    setRows((prev) => {
      const nextNo = prev.length + 1;
      return [
        ...prev,
        { line_no: nextNo, description: "", quantity: 1, unit_price_ht: 0, vat_pct: 19, discount_pct: 0 },
      ];
    });
  }

  function removeLine(lineNo: number) {
    setRows((prev) => {
      const filtered = prev.filter((x) => x.line_no !== lineNo);
      const renum = filtered.map((x, idx) => ({ ...x, line_no: idx + 1 }));
      return renum.length ? renum : prev;
    });
  }

  function updateLine(lineNo: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((x) => (x.line_no === lineNo ? { ...x, ...patch } : x)));
  }

  async function handleSave() {
    setErr(null);

    if (!companyId) return setErr("Veuillez choisir une société.");
    if (!iso4217OK(currency)) return setErr("Devise invalide (ex: TND, EUR, USD).");
    if (!issueDate) return setErr("Veuillez saisir la date d’émission.");

    // au moins 1 ligne utile
    const hasAnyLine = rows.some((r) => (r.description || "").trim() !== "");
    if (!hasAnyLine) return setErr("Ajoutez au moins une ligne (description).");

    startTransition(async () => {
      try {
        // 1) Insert invoice (DRAFT)
        const payload: any = {
          company_id: companyId,
          issue_date: issueDate,
          currency: currency.trim().toUpperCase(),
          stamp_amount: stampEnabled ? round3(toNum(stampAmount, 0)) : 0,

          client_name: clientName.trim() || null,
          client_vat: clientVat.trim() || null,
          client_email: clientEmail.trim() || null,
          client_phone: clientPhone.trim() || null,
          client_address: clientAddress.trim() || null,

          subtotal_ht: totals.subtotal_ht,
          total_vat: totals.total_vat,
          total_ttc: totals.total_ttc,

          // IMPORTANT : DigiGo/TTN ne se gèrent PAS ici.
          // Le “Voir facture” / “Signature” gère : signature, PDF/XML, envoi TTN manuel/programmé.
          status: "draft",
          ttn_status: "not_sent",
        };

        const { data: inv, error: invErr } = await supabase
          .from("invoices")
          .insert(payload)
          .select("id")
          .single();

        if (invErr) throw invErr;

        // 2) Insert lines
        const linesPayload = rows.map((r) => ({
          invoice_id: inv.id,
          line_no: r.line_no,
          description: (r.description || "").trim(),
          quantity: round3(toNum(r.quantity, 0)),
          unit_price_ht: round3(toNum(r.unit_price_ht, 0)),
          vat_pct: round3(toNum(r.vat_pct, 0)),
          discount_pct: round3(toNum(r.discount_pct, 0)),
        }));

        const { error: linesErr } = await supabase.from("invoice_lines").insert(linesPayload);
        if (linesErr) throw linesErr;

        router.push(`/invoices/${inv.id}`);
        router.refresh();
      } catch (e: any) {
        setErr(e?.message ?? "Erreur lors de l’enregistrement.");
      }
    });
  }

  return (
    <div className="ftn-page">
      <div className="ftn-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Créer une facture</div>
            <div className="text-sm text-slate-500">
              Enregistrer d’abord, puis signer / télécharger / envoyer TTN dans “Voir facture”.
            </div>
          </div>

          <div className="flex gap-2">
            <Link href="/invoices" className="ftn-btn ftn-btn-ghost">
              Retour
            </Link>
            <button className="ftn-btn" onClick={handleSave} disabled={pending}>
              {pending ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {err}
          </div>
        ) : null}

        {/* Client */}
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Société</label>
            <select className="ftn-input mt-1 w-full" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Date d’émission</label>
            <input
              type="date"
              className="ftn-input mt-1 w-full"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Client</label>
            <input className="ftn-input mt-1 w-full" value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Matricule fiscal (optionnel)</label>
            <input className="ftn-input mt-1 w-full" value={clientVat} onChange={(e) => setClientVat(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Email (optionnel)</label>
            <input className="ftn-input mt-1 w-full" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          </div>

          <div>
            <label className="text-sm font-medium">Téléphone (optionnel)</label>
            <input className="ftn-input mt-1 w-full" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <label className="text-sm font-medium">Adresse (optionnel)</label>
            <input
              className="ftn-input mt-1 w-full"
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
            />
          </div>
        </div>

        {/* Lignes */}
        <div className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">Lignes</div>
            <button className="ftn-btn" onClick={addLine} type="button">
              + Ajouter ligne
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left font-medium px-3 py-2 w-[52px]">#</th>
                  <th className="text-left font-medium px-3 py-2 min-w-[240px]">Description</th>
                  <th className="text-left font-medium px-3 py-2 w-[110px]">Qté</th>
                  <th className="text-left font-medium px-3 py-2 w-[140px]">PU HT</th>
                  <th className="text-left font-medium px-3 py-2 w-[110px]">TVA %</th>
                  <th className="text-left font-medium px-3 py-2 w-[120px]">Remise %</th>
                  <th className="text-right font-medium px-3 py-2 w-[70px]">—</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => (
                  <tr key={r.line_no} className="border-t">
                    <td className="px-3 py-2 text-slate-500">{r.line_no}</td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full"
                        placeholder="Produit / service..."
                        value={r.description}
                        onChange={(e) => updateLine(r.line_no, { description: e.target.value })}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full"
                        value={r.quantity}
                        onChange={(e) => updateLine(r.line_no, { quantity: toNum(e.target.value, 0) })}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full"
                        value={r.unit_price_ht}
                        onChange={(e) => updateLine(r.line_no, { unit_price_ht: toNum(e.target.value, 0) })}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full"
                        value={r.vat_pct}
                        onChange={(e) => updateLine(r.line_no, { vat_pct: toNum(e.target.value, 0) })}
                      />
                    </td>

                    <td className="px-3 py-2">
                      <input
                        className="ftn-input w-full"
                        value={r.discount_pct}
                        onChange={(e) => updateLine(r.line_no, { discount_pct: toNum(e.target.value, 0) })}
                      />
                    </td>

                    <td className="px-3 py-2 text-right">
                      <button className="ftn-btn ftn-btn-ghost" onClick={() => removeLine(r.line_no)} type="button">
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux (chiffres moins grands) */}
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">Total HT</div>
              <div className="mt-1 text-2xl font-semibold">{totals.subtotal_ht.toFixed(3)} {currency}</div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">TVA</div>
              <div className="mt-1 text-2xl font-semibold">{totals.total_vat.toFixed(3)} {currency}</div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">Timbre fiscal</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="ftn-input w-[110px]"
                  value={stampAmount}
                  onChange={(e) => setStampAmount(toNum(e.target.value, 1))}
                />
                <div className="text-sm text-slate-500">{currency}</div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm text-slate-500">Total TTC (y compris timbre fiscal)</div>
              <div className="mt-1 text-2xl font-semibold">{totals.total_ttc.toFixed(3)} {currency}</div>
              <div className="mt-1 text-xs text-slate-500">
                (HT + TVA = {totals.total_ttc_no_stamp.toFixed(3)} {currency})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
