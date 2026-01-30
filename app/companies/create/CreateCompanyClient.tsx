"use client";

import { useMemo, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

const DEFAULT_VAT_RATES = [0, 7, 13, 19];
const CURRENCY_OPTIONS = ["TND", "EUR", "USD"] as const;

function normalizeVatRates(input: string): number[] {
  const arr = input
    .split(/[,\s;]+/g)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 100);
  const uniq = Array.from(new Set(arr));
  return uniq.length ? uniq : DEFAULT_VAT_RATES;
}

function isValidMF(v: string) {
  const s = (v || "").trim();
  return s.length >= 6;
}

export type CreateCompanyClientProps = {
  groupId?: string;
  successRedirectTo?: string;
};

export default function CreateCompanyClient(props: CreateCompanyClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const groupId = props.groupId ?? null;
  const successRedirectTo = props.successRedirectTo ?? null;

  const [step, setStep] = useState<1 | 2>(1);

  // Étape 1: Identité société
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("TN");

  // Étape 2: Paramètres facturation (TEIF)
  const [defaultCurrency, setDefaultCurrency] =
    useState<(typeof CURRENCY_OPTIONS)[number]>("TND");
  const [vatRatesText, setVatRatesText] = useState("0,7,13,19");
  const vatRates = normalizeVatRates(vatRatesText);
  const [defaultVatPct, setDefaultVatPct] = useState<number>(19);
  const [stampEnabled, setStampEnabled] = useState(false);
  const [stampAmount, setStampAmount] = useState<number>(1);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function validateStep1(): string | null {
    if (!name.trim()) return "Le nom de la société est obligatoire.";
    if (!taxId.trim()) return "Le matricule fiscal (MF) est obligatoire.";
    if (!isValidMF(taxId)) return "Matricule fiscal (MF) invalide.";

    if (!address.trim()) return "L’adresse est obligatoire.";
    if (!city.trim()) return "La ville est obligatoire.";
    if (!governorate.trim()) return "Le gouvernorat est obligatoire.";
    if (!postalCode.trim()) return "Le code postal est obligatoire.";
    if (!country.trim()) return "Le pays est obligatoire (ISO, ex: TN).";
    return null;
  }

  function validateStep2(): string | null {
    const rates = vatRates;
    if (!rates.length) return "Veuillez définir au moins un taux de TVA autorisé.";
    if (!rates.includes(defaultVatPct)) {
      return "La TVA par défaut doit faire partie des taux TVA autorisés.";
    }
    if (stampEnabled && (!Number.isFinite(stampAmount) || stampAmount < 0)) {
      return "Montant timbre invalide.";
    }
    return null;
  }

  function goNext() {
    setErr(null);
    const msg = validateStep1();
    if (msg) return setErr(msg);
    setStep(2);
  }

  async function submit() {
    setErr(null);

    const msg1 = validateStep1();
    if (msg1) {
      setErr(msg1);
      setStep(1);
      return;
    }
    const msg2 = validateStep2();
    if (msg2) {
      setErr(msg2);
      return;
    }

    setLoading(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      // ✅ RPC: crée companies + membership owner
      const { data: companyId, error: rpcErr } = await supabase.rpc("create_company_with_owner", {
        p_company_name: name.trim(),
        p_tax_id: taxId.trim(),
        p_address: address.trim(),
        p_city: city.trim(),
        p_governorate: governorate.trim(),
        p_postal_code: postalCode.trim(),
        p_country: country.trim().toUpperCase(),
        p_phone: phone.trim() || null,
        p_email: email.trim() || null,
      });

      if (rpcErr) throw rpcErr;
      if (!companyId) throw new Error("Création société échouée (id manquant).");

      // ✅ Settings TEIF (company_settings)
      const { error: csErr } = await supabase
        .from("company_settings")
        .upsert(
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

      // ✅ Link au groupe si création depuis groupe
      if (groupId) {
        const { error: linkErr } = await supabase.from("group_companies").insert({
          group_id: groupId,
          company_id: companyId,
          link_type: "internal",
        });
        if (linkErr) throw linkErr;
      }

      router.push(successRedirectTo ?? `/companies/success?id=${companyId}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Erreur lors de la création de la société.");
      setLoading(false);
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Nouvelle société</h2>
        <div className="text-xs text-slate-500">Étape {step}/2</div>
      </div>

      {err && (
        <div className="text-sm rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2">
          {err}
        </div>
      )}

      {step === 1 ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Nom de la société *</label>
            <input className="w-full px-3 py-2 rounded-md border" value={name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="Ex: Société Sana Com" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Matricule fiscal (MF) *</label>
            <input className="w-full px-3 py-2 rounded-md border" value={taxId}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTaxId(e.target.value)}
              placeholder="Ex: 1304544Z" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Pays (ISO) *</label>
              <input className="w-full px-3 py-2 rounded-md border" value={country}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setCountry(e.target.value.toUpperCase())
                }
                placeholder="TN" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Code postal *</label>
              <input className="w-full px-3 py-2 rounded-md border" value={postalCode}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPostalCode(e.target.value)}
                placeholder="1002" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Adresse *</label>
            <input className="w-full px-3 py-2 rounded-md border" value={address}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAddress(e.target.value)}
              placeholder="Rue / Numéro / Localité" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Ville *</label>
              <input className="w-full px-3 py-2 rounded-md border" value={city}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setCity(e.target.value)}
                placeholder="Tunis" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Gouvernorat *</label>
              <input className="w-full px-3 py-2 rounded-md border" value={governorate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setGovernorate(e.target.value)}
                placeholder="Tunis" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Email (recommandé)</label>
              <input className="w-full px-3 py-2 rounded-md border" value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                placeholder="contact@..." />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Téléphone (recommandé)</label>
              <input className="w-full px-3 py-2 rounded-md border" value={phone}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
                placeholder="+216 ..." />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={goNext}
              className="px-4 py-2 rounded-md bg-black text-white">
              Continuer
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Devise par défaut *</label>
            <select className="w-full px-3 py-2 rounded-md border"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value as any)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Taux TVA autorisés *</label>
              <input className="w-full px-3 py-2 rounded-md border"
                value={vatRatesText}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setVatRatesText(e.target.value)}
                placeholder="0,7,13,19" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">TVA par défaut *</label>
              <select className="w-full px-3 py-2 rounded-md border"
                value={defaultVatPct}
                onChange={(e) => setDefaultVatPct(Number(e.target.value))}>
                {vatRates.map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input id="stamp" type="checkbox"
              checked={stampEnabled}
              onChange={(e) => setStampEnabled(e.target.checked)} />
            <label htmlFor="stamp" className="text-sm font-medium">
              Timbre fiscal
            </label>
          </div>

          {stampEnabled ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Montant timbre</label>
              <input className="w-full px-3 py-2 rounded-md border"
                type="number"
                value={stampAmount}
                onChange={(e) => setStampAmount(Number(e.target.value))}
                min={0} step={0.001} />
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep(1)}
              className="px-4 py-2 rounded-md border" disabled={loading}>
              Retour
            </button>

            <button type="button" onClick={submit}
              className="px-4 py-2 rounded-md bg-black text-white"
              disabled={loading}>
              {loading ? "Création..." : "Créer la société"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
