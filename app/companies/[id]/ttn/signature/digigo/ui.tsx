"use client";

import { useEffect, useMemo, useState } from "react";

type Company = { id: string; company_name?: string; tax_id?: string };
type Identity =
  | { phone: string | null; email: string | null; national_id: string | null; updated_at?: string | null }
  | null;

function s(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

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

  const [email, setEmail] = useState<string>(String(identity?.email ?? ""));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setEmail(String(identity?.email ?? ""));
  }, [identity?.email]);

  const configuredEmail = useMemo(() => !isBlank(email), [email]);
  const signatureProvider = useMemo(() => s(initial?.signature_provider || ""), [initial?.signature_provider]);

  const status = useMemo(() => {
    if (!configuredEmail) return { label: "Non configuré", kind: "neutral" as const };
    if (signatureProvider !== "digigo") return { label: "En attente", kind: "warn" as const };
    return { label: "Prêt pour signature", kind: "ok" as const };
  }, [configuredEmail, signatureProvider]);

  async function save() {
    setMsg(null);

    if (!configuredEmail) {
      setMsg({ ok: false, text: "Veuillez renseigner l’email DigiGo du signataire." });
      return;
    }

    setSaving(true);
    try {
      const r1 = await fetch("/api/signature/digigo/identity/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          email: email || null,
        }),
      });

      const j1 = await r1.json().catch(() => null);
      if (!r1.ok || !j1?.ok) {
        setMsg({ ok: false, text: j1?.message || j1?.error || "Enregistrement échoué (DigiGo)." });
        return;
      }

      const currentCfg = initial?.signature_config && typeof initial.signature_config === "object" ? initial.signature_config : {};
      const mergedCfg = { ...currentCfg, digigo_configured: true };

      const r2 = await fetch("/api/ttn/credentials/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          environment,
          signature_provider: "digigo",
          signature_config: mergedCfg,
        }),
      });

      const j2 = await r2.json().catch(() => null);
      if (!r2.ok || !j2?.ok) {
        setMsg({ ok: false, text: j2?.message || j2?.error || "Enregistrement échoué (TTN)." });
        return;
      }

      setMsg({ ok: true, text: "Paramètres DigiGo enregistrés." });
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
          <div className="text-xl font-semibold">Paramètres DigiGo</div>
          <div className="text-sm text-slate-600 mt-1">
            La signature se fait via DigiGo. Un code de validation sera envoyé au signataire lors de chaque signature.
          </div>
        </div>
        <div className={`shrink-0 rounded-full border px-3 py-1 text-xs ${pill(status.kind)}`}>{status.label}</div>
      </div>

      <div className="rounded-2xl border p-5 space-y-4">
        <div className="text-sm font-medium">Email du signataire</div>

        <label className="block">
          <div className="text-sm font-medium">Email DigiGo</div>
          <input
            className="ftn-input mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@domaine.tn"
            inputMode="email"
            autoComplete="email"
          />
          <div className="text-xs text-slate-500 mt-2">
            Utilisez l’email avec lequel le signataire s’est inscrit sur DigiGo.
          </div>
        </label>
      </div>

      {msg ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            msg.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
          }`}
        >
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
