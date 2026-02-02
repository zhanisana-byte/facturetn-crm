"use client";

import { useEffect, useMemo, useState } from "react";

type Company = { id: string; company_name?: string; tax_id?: string };
type Identity = { phone: string | null; email: string | null; national_id: string | null; updated_at?: string | null } | null;

function isBlank(v: unknown) {
  return typeof v !== "string" || v.trim().length === 0;
}

function pill(kind: "neutral" | "ok" | "warn" | "err") {
  if (kind === "ok") return "bg-emerald-50 border-emerald-200 text-emerald-800";
  if (kind === "warn") return "bg-amber-50 border-amber-200 text-amber-800";
  if (kind === "err") return "bg-rose-50 border-rose-200 text-rose-800";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

export default function DigiGoSignatureClient({
  company,
  initial,
  identity,
}: {
  company: Company;
  initial: any;
  identity: Identity;
}) {
  const companyId = company.id;
  const environment = "production" as const;

  const [phone, setPhone] = useState<string>(String(identity?.phone ?? ""));
  const [email, setEmail] = useState<string>(String(identity?.email ?? ""));
  const [cin, setCin] = useState<string>(String(identity?.national_id ?? ""));

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setPhone(String(identity?.phone ?? ""));
    setEmail(String(identity?.email ?? ""));
    setCin(String(identity?.national_id ?? ""));
  }, [identity?.phone, identity?.email, identity?.national_id]);

  const hasPhoneOrEmail = useMemo(() => !isBlank(phone) || !isBlank(email), [phone, email]);

  const configured = useMemo(() => {
    return !!(identity && (!isBlank(identity.phone) || !isBlank(identity.email)));
  }, [identity]);

  const status = useMemo(() => {
    if (configured) return { label: "Enregistré ", kind: "ok" as const };
    return { label: "Non configuré", kind: "neutral" as const };
  }, [configured]);

  async function save() {
    setMsg(null);

    if (!hasPhoneOrEmail) {
      setMsg({ ok: false, text: "Veuillez renseigner un téléphone OU un email (au moins un) pour DigiGO." });
      return;
    }

    setSaving(true);
    try {
      const r2 = await fetch("/api/signature/digigo/identity/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          phone: phone || null,
          email: email || null,
          national_id: cin || null,
        }),
      });

      const j2 = await r2.json().catch(() => null);
      if (!r2.ok || !j2?.ok) {
        setMsg({ ok: false, text: j2?.message || j2?.error || "Enregistrement échoué (DigiGO)." });
        return;
      }

      const currentCfg = (initial?.signature_config && typeof initial.signature_config === "object") ? initial.signature_config : {};
      const mergedCfg = { ...currentCfg, digigo_configured: true };

      const r = await fetch("/api/ttn/credentials/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          environment,
          signature_config: mergedCfg,
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message || j?.error || "Enregistrement échoué (TTN)." });
        return;
      }

      setMsg({ ok: true, text: "DigiGO enregistré avec succès " });
      location.reload();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold">Configurer DigiGO (OTP)</div>
          <div className="text-sm text-slate-600 mt-1">
            DigiGO enverra un code de validation (OTP) par SMS ou email lors de chaque signature.
          </div>
        </div>
        <div className={`shrink-0 rounded-full border px-3 py-1 text-xs ${pill(status.kind)}`}>{status.label}</div>
      </div>

      <div className="rounded-2xl border p-5 space-y-4">
        <div className="text-sm font-medium">Informations du signataire</div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <label className="block">
            <div className="text-sm font-medium">Téléphone (OTP SMS)</div>
            <input className="ftn-input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+216..." />
          </label>

          <label className="block">
            <div className="text-sm font-medium">Email (OTP email)</div>
            <input className="ftn-input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@domaine.tn" />
          </label>

          <label className="block">
            <div className="text-sm font-medium">CIN (optionnel)</div>
            <input className="ftn-input mt-1" value={cin} onChange={(e) => setCin(e.target.value)} placeholder="Optionnel" />
          </label>
        </div>
      </div>

      {msg ? (
        <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
          {msg.text}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button className="ftn-btn" type="button" onClick={save} disabled={saving}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>

        <a className="ftn-btn-ghost" href={`/companies/${companyId}/ttn/signature`}>
          ← Retour
        </a>

        <a className="ftn-btn-ghost" href={`/companies/${companyId}/ttn`}>
          Paramètres TTN
        </a>
      </div>
    </div>
  );
}
