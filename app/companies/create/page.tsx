"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";

type Num = string;

export default function CreateCompanyPage() {
  const router = useRouter();

  // Core (existing DB columns)
  const [company_name, setCompanyName] = useState("");
  const [tax_id, setTaxId] = useState("");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // TTN-ready (stored in optional table: company_ttn_settings)
  const [rc, setRc] = useState("");
  const [establishment_code, setEstablishmentCode] = useState("");
  const [governorate, setGovernorate] = useState("");
  const [postal_code, setPostalCode] = useState("");
  const [country, setCountry] = useState("Tunisie");

  const [vat_default, setVatDefault] = useState<Num>("19");
  const [vat_regime, setVatRegime] = useState("standard");
  const [stamp_enabled_default, setStampEnabledDefault] = useState(true);
  const [stamp_amount_default, setStampAmountDefault] = useState<Num>("1");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isValid = useMemo(() => {
    if (!company_name.trim()) return false;
    if (!tax_id.trim()) return false;
    if (!address.trim()) return false;
    if (!governorate.trim()) return false;
    if (!postal_code.trim()) return false;
    return true;
  }, [company_name, tax_id, address, governorate, postal_code]);

  async function submit() {
    setError(null);
    setInfo(null);

    if (!isValid) {
      setError("Merci de remplir les champs obligatoires (*)");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/companies/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // core
        company_name,
        tax_id,
        email,
        phone,
        address,

        // TTN ready settings (optional table)
        rc,
        establishment_code,
        governorate,
        postal_code,
        country,

        vat_default: Number(vat_default) || 0,
        vat_regime,
        stamp_enabled_default,
        stamp_amount_default: stamp_enabled_default ? Number(stamp_amount_default) || 0 : 0,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data?.error || "Erreur création société");
      return;
    }

    // If the optional table doesn't exist yet, backend returns ok but may include a warning
    if (data?.warning) setInfo(String(data.warning));

    router.push("/companies");
    router.refresh();
  }

  return (
    <AppShell title="Créer société" subtitle="Champs TTN prêts (valeurs par défaut pour vos factures)" accountType={undefined}>
      <div className="max-w-4xl">
        <div className="ftn-form-grid">
          <Card title="Identité société" subtitle="Informations légales (TTN)">
            <div className="ftn-form">
              <label className="ftn-label">
                Raison sociale <span className="ftn-req">*</span>
              </label>
              <input
                placeholder="Ex: Société Sana Com"
                className="ftn-input"
                value={company_name}
                onChange={(e) => setCompanyName(e.target.value)}
              />

              <div className="ftn-two">
                <div>
                  <label className="ftn-label">
                    Matricule fiscale (MF) <span className="ftn-req">*</span>
                  </label>
                  <input
                    placeholder="Ex: 1304544Z"
                    className="ftn-input"
                    value={tax_id}
                    onChange={(e) => setTaxId(e.target.value)}
                  />
                </div>
                <div>
                  <label className="ftn-label">Registre de commerce (RC)</label>
                  <input
                    placeholder="Optionnel"
                    className="ftn-input"
                    value={rc}
                    onChange={(e) => setRc(e.target.value)}
                  />
                </div>
              </div>

              <label className="ftn-label">Code établissement</label>
              <input
                placeholder="Optionnel"
                className="ftn-input"
                value={establishment_code}
                onChange={(e) => setEstablishmentCode(e.target.value)}
              />
            </div>
          </Card>

          <Card title="Adresse & contact" subtitle="Utilisé par défaut dans les documents">
            <div className="ftn-form">
              <label className="ftn-label">
                Adresse <span className="ftn-req">*</span>
              </label>
              <input
                placeholder="Ex: 12 Rue ... , Tunis"
                className="ftn-input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />

              <div className="ftn-two">
                <div>
                  <label className="ftn-label">
                    Gouvernorat <span className="ftn-req">*</span>
                  </label>
                  <input
                    placeholder="Ex: Tunis"
                    className="ftn-input"
                    value={governorate}
                    onChange={(e) => setGovernorate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="ftn-label">
                    Code postal <span className="ftn-req">*</span>
                  </label>
                  <input
                    placeholder="Ex: 1002"
                    className="ftn-input"
                    value={postal_code}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
              </div>

              <div className="ftn-two">
                <div>
                  <label className="ftn-label">Pays</label>
                  <input
                    className="ftn-input"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
                <div>
                  <label className="ftn-label">Téléphone</label>
                  <input
                    placeholder="Optionnel"
                    className="ftn-input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              <label className="ftn-label">Email</label>
              <input
                placeholder="Optionnel"
                className="ftn-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </Card>

          <Card title="Paramètres fiscaux" subtitle="Valeurs par défaut (recommandé)">
            <div className="ftn-form">
              <div className="ftn-two">
                <div>
                  <label className="ftn-label">TVA par défaut (%)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="ftn-input"
                    value={vat_default}
                    onChange={(e) => setVatDefault(e.target.value)}
                  />
                </div>
                <div>
                  <label className="ftn-label">Régime TVA</label>
                  <select className="ftn-input" value={vat_regime} onChange={(e) => setVatRegime(e.target.value)}>
                    <option value="standard">Standard</option>
                    <option value="exempt">Exonéré</option>
                    <option value="suspended">Suspensif</option>
                  </select>
                </div>
              </div>

              <div className="ftn-two">
                <div className="ftn-check">
                  <input
                    id="stamp"
                    type="checkbox"
                    checked={stamp_enabled_default}
                    onChange={(e) => setStampEnabledDefault(e.target.checked)}
                  />
                  <label htmlFor="stamp" className="ftn-label" style={{ margin: 0 }}>
                    Timbre fiscal activé
                  </label>
                </div>
                <div>
                  <label className="ftn-label">Montant timbre</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    disabled={!stamp_enabled_default}
                    className="ftn-input"
                    value={stamp_amount_default}
                    onChange={(e) => setStampAmountDefault(e.target.value)}
                  />
                </div>
              </div>

              {error && <div className="ftn-alert">{error}</div>}
              {info && <div className="ftn-info">{info}</div>}

              <button className="ftn-btn" disabled={loading} onClick={submit}>
                {loading ? "Création..." : "Créer société"}
              </button>

              <div className="ftn-muted mt-2">
                Astuce: ces paramètres seront appliqués automatiquement dans la création de facture (TVA, timbre, etc.).
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
