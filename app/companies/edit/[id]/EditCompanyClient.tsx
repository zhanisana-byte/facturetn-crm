"use client";

import { useEffect, useMemo, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui";

type Company = {
  id: string;
  company_name: string | null;
  tax_id: string | null;

  legal_name?: string | null;
  commercial_name?: string | null;
  address_line?: string | null;

  address?: string | null;
  city?: string | null;
  governorate?: string | null;
  postal_code?: string | null;
  country?: string | null;

  legal_form?: string | null;
  rc?: string | null;
  identifier_type?: string | null;
  vat_regime?: string | null;

  vat_number?: string | null;

  phone?: string | null;
  email?: string | null;

  // compat si vous as ajouté ces colonnes
  vat_rate?: number | null;
  stamp_duty?: number | null;
};

type CompanySettings = {
  company_id: string;
  default_stamp_enabled: boolean;
  default_stamp_amount: number;
  default_vat_pct: number;
};

export default function EditCompanyClient({ companyId }: { companyId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Identité société
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");

  const [legalName, setLegalName] = useState("");
  const [commercialName, setCommercialName] = useState("");

  const [legalForm, setLegalForm] = useState("");
  const [rc, setRc] = useState("");
  const [identifierType, setIdentifierType] = useState("");
  const [vatRegime, setVatRegime] = useState("");

  const [address, setAddress] = useState(""); // champ principal utilisé par le projet
  const [addressLine, setAddressLine] = useState(""); // optionnel si vous veux le garder
  const [city, setCity] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("TN");

  const [vatNumber, setVatNumber] = useState("");

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Defaults facture (company_settings)
  const [defaultVatPct, setDefaultVatPct] = useState<number>(19);
  const [stampEnabled, setStampEnabled] = useState<boolean>(false);
  const [stampAmount, setStampAmount] = useState<number>(1.0);

  async function load() {
    setErr(null);
    setLoading(true);

    if (!supabase) {
      setErr(
        "Configuration Supabase manquante. Vérifiez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sur Vercel."
      );
      setLoading(false);
      return;
    }

    const { data: s, error: authErr } = await supabase.auth.getSession();
    const user = s.session?.user;
    if (authErr || !user) {
      router.push("/login");
      return;
    }

    // 1) company
    const { data, error } = await supabase
      .from("companies")
      .select(
        [
          "id",
          "company_name",
          "tax_id",
          "legal_name",
          "commercial_name",
          "address_line",
          "legal_form",
          "rc",
          "identifier_type",
          "vat_regime",
          "address",
          "city",
          "governorate",
          "postal_code",
          "country",
          "vat_number",
          "phone",
          "email",
          "vat_rate",
          "stamp_duty",
        ].join(",")
      )
      .eq("id", companyId)
      .maybeSingle();

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const row = (data as Company | null) ?? null;
    if (!row) {
      setErr("Société introuvable.");
      setLoading(false);
      return;
    }

    setCompanyName(row.company_name ?? "");
    setTaxId(row.tax_id ?? "");

    setLegalName(row.legal_name ?? "");
    setCommercialName(row.commercial_name ?? "");

    setLegalForm(row.legal_form ?? "");
    setRc(row.rc ?? "");
    setIdentifierType(row.identifier_type ?? "");
    setVatRegime(row.vat_regime ?? "");

    // adresse principale = address, et si vide on prend address_line
    const a = (row.address ?? "").trim();
    const al = (row.address_line ?? "").trim();
    setAddress(a || al);
    setAddressLine(al);

    setCity(row.city ?? "");
    setGovernorate(row.governorate ?? "");
    setPostalCode(row.postal_code ?? "");
    setCountry((row.country ?? "TN").toUpperCase());

    setVatNumber(row.vat_number ?? row.tax_id ?? ""); // fallback MF
    setPhone(row.phone ?? "");
    setEmail(row.email ?? "");

    // 2) company_settings defaults
    const { data: cs } = await supabase
      .from("company_settings")
      .select("company_id, default_stamp_enabled, default_stamp_amount, default_vat_pct")
      .eq("company_id", companyId)
      .maybeSingle();

    if (cs) {
      const settings = cs as CompanySettings;
      setStampEnabled(Boolean(settings.default_stamp_enabled));
      setStampAmount(Number(settings.default_stamp_amount ?? 1.0));
      setDefaultVatPct(Number(settings.default_vat_pct ?? 19));
    } else {
      // fallback si row n'existe pas encore
      setStampEnabled(false);
      setStampAmount(1.0);
      setDefaultVatPct(19);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function save() {
    setErr(null);
    setSaving(true);

    const { data: s, error: authErr } = await supabase.auth.getSession();
    const user = s.session?.user;
    if (authErr || !user) {
      router.push("/login");
      return;
    }

    if (!companyName.trim()) {
      setErr("Le nom de société est obligatoire.");
      setSaving(false);
      return;
    }

    const vatPct = Number.isFinite(Number(defaultVatPct)) ? Number(defaultVatPct) : 19;
    const stAmt = Number.isFinite(Number(stampAmount)) ? Number(stampAmount) : 1.0;

    // 1) update companies (TEIF identité)
    const { error: e1 } = await supabase
      .from("companies")
      .update({
        company_name: companyName.trim(),
        tax_id: taxId.trim() || null,

        legal_name: legalName.trim() || null,
        commercial_name: commercialName.trim() || null,
        address_line: addressLine.trim() || null,

        legal_form: legalForm.trim() || null,
        rc: rc.trim() || null,
        identifier_type: identifierType.trim() || null,
        vat_regime: vatRegime.trim() || null,

        address: address.trim() || null,
        city: city.trim() || null,
        governorate: governorate.trim() || null,
        postal_code: postalCode.trim() || null,
        country: (country.trim() || "TN").toUpperCase(),

        vat_number: vatNumber.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,

        // compat (si ces colonnes existent chez vous)
        vat_rate: vatPct,
        stamp_duty: stAmt,

        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);

    if (e1) {
      setErr(e1.message);
      setSaving(false);
      return;
    }

    // 2) upsert company_settings (defaults facture)
    const { error: e2 } = await supabase
      .from("company_settings")
      .upsert(
        {
          company_id: companyId,
          default_vat_pct: vatPct,
          default_stamp_enabled: Boolean(stampEnabled),
          default_stamp_amount: stAmt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      );

    if (e2) {
      setErr(e2.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push(`/companies/${companyId}`);
    router.refresh();
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Société — champs TEIF + TVA/Timbre</h2>
        <button
          type="button"
          className="px-3 py-2 rounded-md border text-sm"
          onClick={() => router.back()}
          disabled={saving}
        >
          Retour
        </button>
      </div>

      {err && (
        <div className="text-sm rounded-md border border-red-200 bg-red-50 text-red-700 px-3 py-2">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-600">Chargement...</div>
      ) : (
        <div className="space-y-5">
          {/* Identité société */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">Identité société</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Nom affiché (company_name) *</label>
                <input className="w-full px-3 py-2 rounded-md border" value={companyName} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCompanyName(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Matricule fiscal (tax_id / MF)</label>
                <input className="w-full px-3 py-2 rounded-md border" value={taxId} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setTaxId(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Raison sociale (legal_name)</label>
                <input className="w-full px-3 py-2 rounded-md border" value={legalName} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setLegalName(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Nom commercial (commercial_name)</label>
                <input className="w-full px-3 py-2 rounded-md border" value={commercialName} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCommercialName(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Forme juridique</label>
                <input className="w-full px-3 py-2 rounded-md border" value={legalForm} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setLegalForm(e.target.value)} placeholder="SUARL" />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">RC</label>
                <input className="w-full px-3 py-2 rounded-md border" value={rc} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setRc(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Type identifiant</label>
                <input className="w-full px-3 py-2 rounded-md border" value={identifierType} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setIdentifierType(e.target.value)} placeholder="MF / CIN / ..." />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Régime TVA</label>
                <input className="w-full px-3 py-2 rounded-md border" value={vatRegime} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setVatRegime(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Adresse */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">Adresse</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium">Adresse (address) — utilisée par le PDF</label>
                <input className="w-full px-3 py-2 rounded-md border" value={address} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setAddress(e.target.value)} />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium">Adresse ligne (address_line) — optionnel</label>
                <input className="w-full px-3 py-2 rounded-md border" value={addressLine} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setAddressLine(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Ville</label>
                <input className="w-full px-3 py-2 rounded-md border" value={city} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCity(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Gouvernorat</label>
                <input className="w-full px-3 py-2 rounded-md border" value={governorate} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setGovernorate(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Code postal</label>
                <input className="w-full px-3 py-2 rounded-md border" value={postalCode} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setPostalCode(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Pays</label>
                <input className="w-full px-3 py-2 rounded-md border" value={country} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setCountry(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Contact + TVA number */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">Contact + TVA</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">N° TVA (vat_number)</label>
                <input className="w-full px-3 py-2 rounded-md border" value={vatNumber} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setVatNumber(e.target.value)} placeholder="MF..." />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Téléphone</label>
                <input className="w-full px-3 py-2 rounded-md border" value={phone} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setPhone(e.target.value)} />
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-sm font-medium">Email</label>
                <input className="w-full px-3 py-2 rounded-md border" value={email} onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setEmail(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Defaults facture */}
          <div className="space-y-2">
            <div className="text-sm font-semibold">Paramètres facture (auto, sans répétition)</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">TVA par défaut (%)</label>
                <input
                  className="w-full px-3 py-2 rounded-md border"
                  type="number"
                  step="0.01"
                  value={String(defaultVatPct)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setDefaultVatPct(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1 flex items-end">
                <label className="text-sm font-medium flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={stampEnabled}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setStampEnabled(e.target.checked)}
                  />
                  Timbre activé
                </label>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Timbre (TND)</label>
                <input
                  className="w-full px-3 py-2 rounded-md border"
                  type="number"
                  step="0.001"
                  value={String(stampAmount)}
                  onChange={(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setStampAmount(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="text-xs text-slate-600">
              Ces valeurs sont lues automatiquement dans <b>Créer facture</b>.
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-50"
              onClick={save}
              disabled={saving}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
