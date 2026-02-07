"use client";

import { useMemo, useState } from "react";

type Company = { id: string; company_name?: string; tax_id?: string };

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
}: {
  company: Company;
  initial: any;
}) {
  const companyId = company.id;
  const environment = "production" as const;

  const initialCfg =
    initial?.signature_config && typeof initial.signature_config === "object" ? initial.signature_config : {};

  const initialEmail = s(initialCfg?.digigo_signer_email || initial?.cert_email || "");

  const [email, setEmail] = useState<string>(initialEmail);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const configuredEmail = useMemo(() => !isBlank(email), [email]);
  const signatureProvider = useMemo(() => s(initial?.signature_provider || ""), [initial?.signature_provider]);

  const status = useMemo(() => {
    if (!configuredEmail) return { label: "Non configuré", kind: "neutral" as const };
    if (signatureProvider !== "digigo") return { label: "En attente", kind: "warn" as const };
    return { label: "Prêt pour signature", kind: "ok" as const };
  }, [configuredEmail, signatureProvider]);

  async function save() {
    setMsg(null);

    const cleanEmail = s(email);
    if (!cleanEmail) {
      setMsg({ ok: false, text: "Veuillez renseigner l’email DigiGo du signataire (société)." });
      return;
    }

    setSaving(true);
    try {
      const mergedCfg = { ...initialCfg, digigo_signer_email: cleanEmail, digigo_configured: true };

      const r = await fetch("/api/ttn/credentials/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          environment,
          signature_provider: "digigo",
          signature_config: mergedCfg,
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message || j?.error || "Enregistrement échoué." });
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
            Renseignez l’email du signataire DigiGo pour cette société. Il sera utilisé lors des signatures.
          </div>
        </div>
        <div className={`shrink-0 rounded-full border px-3 py-1 text-xs ${pill(status.kind)}`}>{status.label}</div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-sm font-medium text-slate-800">Société</div>
            <div className="mt-1 text-slate-700">{company.company_name || "—"}</div>
            <div className="mt-1 text-xs text-slate-500">MF: {company.tax_id || "—"}</div>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-800">Email DigiGo (Société)</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: signer@entreprise.tn"
              className="mt-2 w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-200"
              autoComplete="email"
              inputMode="email"
            />
            <div className="mt-2 text-xs text-slate-500">
              Cet email est enregistré dans les paramètres TTN de la société.
            </div>
          </div>
        </div>

        {msg ? (
          <div
            className={`mt-4 rounded-xl border px-3 py-2 text-sm ${
              msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {msg.text}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
