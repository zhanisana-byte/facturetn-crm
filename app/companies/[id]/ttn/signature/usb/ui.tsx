"use client";

import { useEffect, useMemo, useState } from "react";

type Company = { id: string; company_name?: string };
type PairState = { deepLinkUrl: string; token?: string; expires_at?: string };

type StepId = 1 | 2 | 3;

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function pill(kind: "neutral" | "warn" | "ok" | "err") {
  if (kind === "ok") return "bg-emerald-50 border-emerald-200 text-emerald-800";
  if (kind === "warn") return "bg-amber-50 border-amber-200 text-amber-800";
  if (kind === "err") return "bg-rose-50 border-rose-200 text-rose-800";
  return "bg-slate-50 border-slate-200 text-slate-700";
}

function StepTab({
  id,
  title,
  active,
  done,
  onClick,
}: {
  id: StepId;
  title: string;
  active: boolean;
  done?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-2xl border px-4 py-3 text-left transition",
        active ? "bg-white shadow-sm" : "bg-slate-50 hover:bg-white",
        "min-w-[220px]"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-10 w-10 rounded-xl border flex items-center justify-center font-semibold",
            active ? "bg-white" : "bg-slate-100",
            done ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-700"
          )}
        >
          {String(id).padStart(2, "0")}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          <div className="text-xs text-slate-500">
            {done ? "Terminé" : active ? "En cours" : "À faire"}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function UsbSignatureClient({
  company,
  initial,
  environment,
}: {
  company: Company;
  initial: any;
  environment: "test" | "production";
}) {
  const companyId = company.id;

  const [step, setStep] = useState<StepId>(1);
  const [pairLoading, setPairLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [providerSaved, setProviderSaved] = useState(false);
  const [sigStatus, setSigStatus] = useState<string>("unconfigured"); // unconfigured | pairing | paired | error
  const [pair, setPair] = useState<PairState | null>(null);

  useEffect(() => {
    const provider = String(initial?.signature_provider ?? "none");
    const status = String(initial?.signature_status ?? "unconfigured");
    setProviderSaved(provider === "usb_agent");
    setSigStatus(status);

    // ✅ Step auto simple
    if (provider !== "usb_agent") setStep(1);
    else if (status === "paired") setStep(3);
    else setStep(2);
  }, [initial]);

  const statusUi = useMemo(() => {
    if (!providerSaved) return { label: "Non configuré", kind: "neutral" as const };
    if (sigStatus === "paired") return { label: "Appairé ✅", kind: "ok" as const };
    if (sigStatus === "pairing") return { label: "Appairage en cours", kind: "warn" as const };
    if (sigStatus === "error") return { label: "Erreur d’appairage", kind: "err" as const };
    return { label: "Enregistré – à appairer", kind: "warn" as const };
  }, [providerSaved, sigStatus]);

  const done1 = true;
  const done2 = providerSaved && (sigStatus === "paired" || sigStatus === "pairing");
  const done3 = providerSaved && sigStatus === "paired";

  async function onGeneratePairLink() {
    setMsg(null);
    setPair(null);
    setPairLoading(true);

    try {
      // ✅ 1) Enregistrer la méthode (UPsert = pas de duplication)
      const rSave = await fetch("/api/ttn/credentials/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          environment,
          signature_provider: "usb_agent",
          signature_status: "pairing",
          require_signature: true,
        }),
      });

      const jSave = await rSave.json().catch(() => null);
      if (!rSave.ok || !jSave?.ok) {
        setMsg({
          ok: false,
          text: jSave?.message || jSave?.error || "Enregistrement de la méthode échoué.",
        });
        return;
      }

      setProviderSaved(true);
      setSigStatus("pairing");

      // ✅ 2) Générer le lien (deep link) pour l’agent
      const r = await fetch("/api/signature/pair-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          environment,
        }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.deepLinkUrl) {
        setMsg({
          ok: false,
          text: j?.message || j?.error || "Création du lien d’appairage échouée.",
        });
        return;
      }

      setPair({
        deepLinkUrl: String(j.deepLinkUrl),
        token: j.token ? String(j.token) : undefined,
        expires_at: j.expires_at ? String(j.expires_at) : undefined,
      });

      setMsg({
        ok: true,
        text: "🔗 Lien généré. Ouvrez-le sur le PC Windows où l’agent est installé (clé branchée).",
      });

      setStep(3);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Erreur réseau." });
    } finally {
      setPairLoading(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ ok: true, text: "✅ Copié." });
    } catch {
      setMsg({ ok: false, text: "Impossible de copier automatiquement. Copiez manuellement." });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="text-xl font-semibold">Signature par clé USB (Agent Windows)</div>
        <div className="text-sm text-slate-600">
          Méthode destinée aux sociétés qui possèdent un <b>certificat électronique sur clé USB (token)</b>. La signature se fait{" "}
          <b>sur votre PC Windows</b> (clé branchée). Le site <b>ne voit jamais</b> la clé.
        </div>

        <div className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", pill(statusUi.kind))}>
          {statusUi.label}
        </div>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap gap-3">
        <StepTab id={1} title="Télécharger l’agent Windows" active={step === 1} done={done1} onClick={() => setStep(1)} />
        <StepTab id={2} title="Générer le lien (une seule fois)" active={step === 2} done={done2} onClick={() => setStep(2)} />
        <StepTab id={3} title="Signer vos factures" active={step === 3} done={done3} onClick={() => setStep(3)} />
      </div>

      {/* Content */}
      <div className="rounded-2xl border bg-white p-6 space-y-4">
        {step === 1 ? (
          <div className="space-y-3">
            <div className="text-base font-semibold">01 — Télécharger l’agent Windows</div>
            <div className="text-sm text-slate-600">
              Installez l’agent sur le <b>PC Windows</b> qui utilisera la clé USB.
              <br />
              <span className="text-xs text-slate-500">
                👉 La clé USB (token) doit être branchée sur ce PC au moment de l’appairage et de la signature.
              </span>
            </div>

            <div className="pt-2 flex flex-wrap gap-3">
              {/* ✅ Correct (existe dans votre ZIP) */}
              <a className="ftn-btn" href="/agent/FactureTN_Agent_Windows_Extension.zip" target="_blank" rel="noreferrer">
                Télécharger l’agent Windows
              </a>

              {/* ✅ Compat (si vous gardez une route redirect) */}
              <a className="ftn-btn-ghost" href="/downloads/agent" target="_blank" rel="noreferrer">
                Lien alternatif
              </a>
            </div>

            <div className="text-xs text-slate-500">
              ✅ Installez l’agent sur le PC Windows qui porte la clé (token).
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <div className="text-base font-semibold">02 — Générer le lien d’appairage (une seule fois)</div>

            <div className="text-sm text-slate-600">
              Cette étape associe <b>votre certificat (clé USB)</b> à <b>votre société</b>.
              <br />
              <span className="text-xs text-slate-500">
                💡 Une seule action : cliquez “Générer”, puis ouvrez le lien sur le PC Windows où l’agent est installé.
              </span>
            </div>

            <div className="pt-2 flex flex-wrap gap-3">
              <button className="ftn-btn" type="button" onClick={onGeneratePairLink} disabled={pairLoading}>
                {pairLoading ? "Génération..." : "Générer le lien d’appairage"}
              </button>
            </div>

            {pair?.deepLinkUrl ? (
              <div className="rounded-xl border bg-slate-50 p-3 text-xs space-y-2">
                <div className="font-semibold">Lien d’appairage</div>
                <div className="break-all">{pair.deepLinkUrl}</div>

                <div className="text-[11px] text-slate-500">
                  ⚠️ Ne partagez pas ce lien. Il sert uniquement à appairer l’agent à cette société.
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button className="ftn-btn-ghost" type="button" onClick={() => copy(pair.deepLinkUrl)}>
                    Copier le lien
                  </button>
                  <a className="ftn-btn-ghost" href={pair.deepLinkUrl} target="_blank" rel="noreferrer">
                    Ouvrir le lien
                  </a>
                </div>

                {pair.expires_at ? (
                  <div className="text-slate-500">Expire : {new Date(pair.expires_at).toLocaleString()}</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <div className="text-base font-semibold">03 — Signer vos factures</div>

            <div className="text-sm text-slate-600">
              Après création de facture, au moment de <b>Signer / Approuver</b> :
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li>La clé USB doit être branchée sur le <b>PC Windows</b> où l’agent est installé</li>
                <li>L’agent demande le <b>PIN</b></li>
                <li>La facture est signée depuis votre PC</li>
              </ul>
              <div className="text-xs text-slate-500 mt-2">🔐 La clé reste toujours sur votre PC. Le site ne voit jamais la clé.</div>
            </div>

            {!done2 ? (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                ⚠️ Pour signer, faites d’abord l’étape 02 (générer le lien et appairer).
              </div>
            ) : sigStatus === "paired" ? (
              <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                ✅ Prêt. Vos factures peuvent être signées via l’agent (clé branchée).
              </div>
            ) : (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                ⏳ Appairage en cours. Ouvrez le lien d’appairage sur le PC Windows.
              </div>
            )}

            <div className="pt-2">
              <a className="ftn-btn-ghost" href={`/companies/${companyId}/ttn`}>
                Paramètres TTN
              </a>
            </div>
          </div>
        ) : null}
      </div>

      {/* Message */}
      {msg ? (
        <div
          className={cn(
            "rounded-xl border p-3 text-sm",
            msg.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
          )}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}
