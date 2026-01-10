"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AuthShell from "@/app/components/AuthShell";

export default function OnboardingClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [accountType, setAccountType] = useState<"entreprise" | "multi_societe" | "comptable">("entreprise");
  const [planCode, setPlanCode] = useState("client_50");
  const [maxCompanies, setMaxCompanies] = useState(1);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function applyPlan(type: typeof accountType) {
    // Plans selon ton business model
    if (type === "entreprise") {
      setPlanCode("client_50");
      setMaxCompanies(1);
    } else if (type === "multi_societe") {
      // Par défaut: groupe 5 sociétés à 200dt
      setPlanCode("group_200_5");
      setMaxCompanies(5);
    } else {
      // comptable gratuit
      setPlanCode("accountant_free");
      setMaxCompanies(0);
    }
  }

  async function save() {
    setLoading(true);
    setErr(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Tu dois te connecter.");

      // Update profile
      const { error } = await supabase
        .from("app_users")
        .update({
          account_type: accountType,
          plan_code: planCode,
          max_companies: maxCompanies,
          // comptable: status pending par défaut, on garde
        })
        .eq("id", auth.user.id);

      if (error) throw error;

      router.push("/dashboard");
    } catch (e: any) {
      setErr(e?.message ?? "Erreur save.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Type de compte" subtitle="Choisis le mode d’utilisation (modifiable plus tard).">
      <div className="ftn-radio-grid">
        <label className="ftn-radio">
          <input
            type="radio"
            name="account_type"
            checked={accountType === "entreprise"}
            onChange={() => {
              setAccountType("entreprise");
              applyPlan("entreprise");
            }}
          />
          <div>
            <b>Client (PME) — 50 DT / mois</b>
            <span>1 société (1 MF). Factures + export PDF/XML.</span>
          </div>
        </label>

        <label className="ftn-radio">
          <input
            type="radio"
            name="account_type"
            checked={accountType === "multi_societe"}
            onChange={() => {
              setAccountType("multi_societe");
              applyPlan("multi_societe");
            }}
          />
          <div>
            <b>Grande Société / Groupe — 200–300 DT / mois</b>
            <span>Multi-sociétés, équipe interne, permissions avancées.</span>
          </div>
        </label>

        <label className="ftn-radio">
          <input
            type="radio"
            name="account_type"
            checked={accountType === "comptable"}
            onChange={() => {
              setAccountType("comptable");
              applyPlan("comptable");
            }}
          />
          <div>
            <b>Comptable — gratuit (validation MF + patente)</b>
            <span>Multi-clients, équipe d’aides, validation/envoi TTN.</span>
          </div>
        </label>

        {accountType === "multi_societe" ? (
          <div className="ftn-card">
            <div className="ftn-card-title">Pack Groupe</div>
            <div className="mt-3 grid gap-3">
              <label className="ftn-label">Choisir un pack</label>
              <select
                className="ftn-select"
                value={planCode}
                onChange={(e) => {
                  const v = e.target.value;
                  setPlanCode(v);
                  if (v === "group_200_5") setMaxCompanies(5);
                  if (v === "group_300_unlimited") setMaxCompanies(9999);
                }}
              >
                <option value="group_200_5">Jusqu’à 5 sociétés — 200 DT/mois</option>
                <option value="group_300_unlimited">Illimité — 300 DT/mois</option>
              </select>
              <div className="ftn-muted">Max sociétés: <b className="text-slate-900">{maxCompanies}</b></div>
            </div>
          </div>
        ) : null}

        {accountType === "comptable" ? (
          <div className="ftn-card">
            <div className="ftn-card-title">Validation comptable</div>
            <p className="ftn-muted mt-2">
              Statut: <b className="text-slate-900">pending</b>. Tu pourras ajouter MF + patente dans Profil.
            </p>
          </div>
        ) : null}

        {err ? <div className="ftn-alert">{err}</div> : null}

        <button onClick={save} disabled={loading} className="ftn-btn w-full">
          {loading ? "Enregistrement..." : "Continuer"}
        </button>
      </div>
    </AuthShell>
  );
}
