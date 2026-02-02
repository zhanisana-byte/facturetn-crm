"use client";

import { useMemo, useState } from "react";

type Company = { id: string; company_name?: string };
function pill(kind: "neutral" | "ok" | "warn" | "err") {
  if (kind === "ok") return "bg-emerald-50 border-emerald-200 text-emerald-800";
  if (kind === "warn") return "bg-amber-50 border-amber-200 text-amber-800";
  if (kind === "err") return "bg-rose-50 border-rose-200 text-rose-800";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

export default function ModeEnvoiManualClient({ company, initial }: { company: Company; initial: any }) {
  const companyId = company.id;
  const environment = "production" as const;

  const configured = useMemo(() => String(initial?.send_mode ?? "") === "manual", [initial]);
  const status = configured ? { label: "Activé ", kind: "ok" as const } : { label: "Non activé", kind: "neutral" as const };

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setMsg(null);
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        environment,
        send_mode: "manual",
        connection_type: "webservice",
        ws_url: null,
        ws_login: null,
        ws_password: null,
      };

      const r = await fetch("/api/ttn/credentials/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message || j?.error || "Enregistrement échoué." });
        return;
      }

      setMsg({ ok: true, text: "Déclaration manuelle activée " });
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
          <div className="text-xl font-semibold">Déclaration manuelle</div>
          <div className="text-sm text-slate-600 mt-1">
            Aucun paramètre de connexion TTN n’est requis. Vous exporterez le TEIF (XML) et vous le déposerez manuellement sur TTN.
          </div>
        </div>
        <div className={`shrink-0 rounded-full border px-3 py-1 text-xs ${pill(status.kind)}`}>{status.label}</div>
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
        <a className="ftn-btn-ghost" href={`/companies/${companyId}/ttn/mode-envoi`}>
          ← Retour
        </a>
        <a className="ftn-btn-ghost" href={`/companies/${companyId}/ttn`}>
          Paramètres TTN
        </a>
      </div>
    </div>
  );
}
