"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_VAT_RATES = [0, 7, 13, 19];
const CURRENCIES = ["TND", "EUR", "USD"] as const;

function normalizeVatRates(input: string): number[] {
  const arr = String(input || "")
    .split(/[,\s;]+/g)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  const uniq = Array.from(new Set(arr));
  return uniq.length ? uniq : DEFAULT_VAT_RATES;
}
function isValidMF(v: string) {
  return String(v || "").trim().length >= 6;
}

export default function GroupInternalCompanyCreateClient({ groupId }: { groupId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [country, setCountry] = useState("TN");
  const [postalCode, setPostalCode] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [defaultCurrency, setDefaultCurrency] =
    useState<(typeof CURRENCIES)[number]>("TND");
  const [vatRatesText, setVatRatesText] = useState("0,7,13,19");
  const vatRates = normalizeVatRates(vatRatesText);
  const [defaultVatPct, setDefaultVatPct] = useState<number>(19);
  const [stampEnabled, setStampEnabled] = useState(false);
  const [stampAmount, setStampAmount] = useState<number>(1);

  function validate1() {
    if (!companyName.trim()) return "Nom de la société obligatoire.";
    if (!taxId.trim()) return "MF obligatoire.";
    if (!isValidMF(taxId)) return "MF invalide.";
    if (!country.trim() || !postalCode.trim() || !address.trim() || !city.trim() || !governorate.trim())
      return "Adresse complète obligatoire.";
    return null;
  }
  function validate2() {
    if (!vatRates.includes(defaultVatPct)) return "TVA par défaut invalide.";
    if (stampEnabled && stampAmount < 0) return "Timbre invalide.";
    return null;
  }

  async function submit() {
    setErr(null);
    const e1 = validate1();
    if (e1) return setErr(e1);
    const e2 = validate2();
    if (e2) {
      setStep(2);
      return setErr(e2);
    }

    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) return router.push("/login");

      const { data: companyId, error: rpcErr } = await supabase.rpc("create_company_with_owner", {
        p_company_name: companyName.trim(),
        p_tax_id: taxId.trim(),
        p_address: address.trim(),
        p_city: city.trim(),
        p_governorate: governorate.trim(),
        p_postal_code: postalCode.trim(),
        p_country: country.trim().toUpperCase(),
        p_phone: phone.trim() ? phone.trim() : null,
        p_email: email.trim() ? email.trim() : null,
      });

      if (rpcErr) throw rpcErr;
      if (!companyId) throw new Error("Création société échouée.");

      const { error: csErr } = await supabase.from("company_settings").upsert(
        {
          company_id: companyId,
          default_currency: defaultCurrency,
          vat_rates: vatRates,
          default_vat_pct: defaultVatPct,
          default_stamp_enabled: stampEnabled,
          default_stamp_amount: stampEnabled ? Number(stampAmount) || 0 : 0,
        },
        { onConflict: "company_id" }
      );
      if (csErr) throw csErr;

      const { error: linkErr } = await supabase.from("group_companies").insert({
        group_id: groupId,
        company_id: companyId,
        link_type: "internal",
      });
      if (linkErr) throw linkErr;

      router.push(`/groups/${groupId}/droits?createdCompany=${companyId}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erreur création société interne.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {err ? <div className="ftn-err">{err}</div> : null}

      {step === 1 ? (
        <div className="ftn-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Société interne</div>
            <div className="text-xs opacity-70">Étape 1/2</div>
          </div>

          <div>
            <label className="ftn-label">Nom société *</label>
            <input className="ftn-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label className="ftn-label">MF *</label>
            <input className="ftn-input" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="ftn-label">Pays *</label><input className="ftn-input" value={country} onChange={(e)=>setCountry(e.target.value)} /></div>
            <div><label className="ftn-label">Code postal *</label><input className="ftn-input" value={postalCode} onChange={(e)=>setPostalCode(e.target.value)} /></div>
          </div>
          <div><label className="ftn-label">Adresse *</label><input className="ftn-input" value={address} onChange={(e)=>setAddress(e.target.value)} /></div>
          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="ftn-label">Ville *</label><input className="ftn-input" value={city} onChange={(e)=>setCity(e.target.value)} /></div>
            <div><label className="ftn-label">Gouvernorat *</label><input className="ftn-input" value={governorate} onChange={(e)=>setGovernorate(e.target.value)} /></div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="ftn-label">Email</label><input className="ftn-input" value={email} onChange={(e)=>setEmail(e.target.value)} /></div>
            <div><label className="ftn-label">Téléphone</label><input className="ftn-input" value={phone} onChange={(e)=>setPhone(e.target.value)} /></div>
          </div>

          <div className="flex justify-end">
            <button className="ftn-btn-primary" type="button" onClick={() => { const e=validate1(); if(e) return setErr(e); setErr(null); setStep(2); }}>
              Continuer
            </button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="ftn-card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Facturation</div>
            <div className="text-xs opacity-70">Étape 2/2</div>
          </div>

          <div>
            <label className="ftn-label">Devise *</label>
            <select className="ftn-input" value={defaultCurrency} onChange={(e)=>setDefaultCurrency(e.target.value as any)}>
              {CURRENCIES.map((c)=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div><label className="ftn-label">TVA autorisées *</label><input className="ftn-input" value={vatRatesText} onChange={(e)=>setVatRatesText(e.target.value)} /></div>
            <div>
              <label className="ftn-label">TVA par défaut *</label>
              <select className="ftn-input" value={defaultVatPct} onChange={(e)=>setDefaultVatPct(Number(e.target.value))}>
                {vatRates.map((r)=><option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" checked={stampEnabled} onChange={(e)=>setStampEnabled(e.target.checked)} />
            <span className="text-sm">Timbre fiscal (par défaut)</span>
          </div>

          {stampEnabled ? (
            <div>
              <label className="ftn-label">Montant timbre</label>
              <input className="ftn-input" type="number" min={0} step={0.001} value={stampAmount} onChange={(e)=>setStampAmount(Number(e.target.value))} />
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <button className="ftn-btn-secondary" type="button" onClick={()=>setStep(1)} disabled={loading}>Retour</button>
            <button className="ftn-btn-primary" type="button" onClick={submit} disabled={loading}>
              {loading ? "Création..." : "Créer la société"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
