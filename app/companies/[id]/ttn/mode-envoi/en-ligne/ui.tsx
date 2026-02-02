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
        <div>
          <div className="text-sm font-semibold">{title}</div>
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

  const base =
    (process.env.NEXT_PUBLIC_SITE_URL && process.env.NEXT_PUBLIC_SITE_URL.trim()) ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const baseUrl = base.replace(/\/$/, "");
  const downloadUrl = `${baseUrl}/agent/FactureTN_Agent_Windows_Extension.zip`;
  const fallbackUrl = `${baseUrl}/downloads/agent`;

  const [step, setStep] = useState<StepId>(1);
  const [pairLoading, setPairLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [providerSaved, setProviderSaved] = useState(false);
  const [sigStatus, setSigStatus] = useState<string>("unconfigured");
  const [pair, setPair] = useState<PairState | null>(null);

  useEffect(() => {
    const provider = String(initial?.signature_provider ?? "none");
    const status = String(initial?.signature_status ?? "unconfigured");

    setProviderSaved(provider === "usb_agent");
    setSigStatus(status);

    if (provider !== "usb_agent") setStep(1);
    else if (status === "paired") setStep(3);
    else setStep(2);
  }, [initial]);

  const statusUi = useMemo(() => {
    if (!providerSaved) return { label: "Non configuré", kind: "neutral" as const };
    if (sigStatus === "paired") return { label: "Appairé ", kind: "ok" as const };
    if (sigStatus === "pairing") return { label: "Appairage en cours", kind: "warn" as const };
    if (sigStatus === "error") return { label: "Erreur", kind: "err" as const };
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
        setMsg({ ok: false, text: jSave?.message || jSave?.error || "Erreur enregistrement méthode." });
        return;
      }

      setProviderSaved(true);
      setSigStatus("pairing");

      const r = await fetch("/api/signature/pair-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, environment }),
      });

      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.deepLinkUrl) {
        setMsg({ ok: false, text: j?.message || j?.error || "Erreur génération lien." });
        return;
      }

      setPair({
        deepLinkUrl: String(j.deepLinkUrl),
        token: j.token,
        expires_at: j.expires_at,
      });

      setMsg({ ok: true, text: " Lien généré. Ouvrez-le sur le PC Windows (clé branchée)." });
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
      setMsg({ ok: true, text: "Copié " });
    } catch {
      setMsg({ ok: false, text: "Copie impossible." });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Signature par clé USB (Agent Windows)</h1>
        <p className="text-sm text-slate-600">
          La signature se fait <b>sur votre PC Windows</b>. La clé USB ne quitte jamais votre ordinateur.
        </p>
        <div className={cn("inline-flex mt-2 rounded-full border px-3 py-1 text-xs", pill(statusUi.kind))}>
          {statusUi.label}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <StepTab id={1} title="Télécharger l’agent" active={step === 1} done={done1} onClick={() => setStep(1)} />
        <StepTab id={2} title="Générer le lien" active={step === 2} done={done2} onClick={() => setStep(2)} />
        <StepTab id={3} title="Signer les factures" active={step === 3} done={done3} onClick={() => setStep(3)} />
      </div>

      <div className="rounded-2xl border bg-white p-6 space-y-4">
        {step === 1 && (
          <>
            <p className="text-sm">Installez l’agent sur le PC Windows qui contient la clé USB.</p>
            <div className="flex gap-3">
              <a className="ftn-btn" href={downloadUrl} target="_blank" rel="noreferrer">
                Télécharger l’agent Windows
              </a>
              <a className="ftn-btn-ghost" href={fallbackUrl} target="_blank" rel="noreferrer">
                Lien alternatif
              </a>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm">Cliquez une seule fois pour générer le lien d’appairage.</p>
            <button className="ftn-btn" onClick={onGeneratePairLink} disabled={pairLoading}>
              {pairLoading ? "Génération..." : "Générer le lien"}
            </button>

            {pair && (
              <div className="rounded-xl border bg-slate-50 p-3 text-xs">
                <div className="break-all">{pair.deepLinkUrl}</div>
                <div className="flex gap-2 mt-2">
                  <button className="ftn-btn-ghost" onClick={() => copy(pair.deepLinkUrl)}>
                    Copier
                  </button>
                  <a className="ftn-btn-ghost" href={pair.deepLinkUrl} target="_blank" rel="noreferrer">
                    Ouvrir
                  </a>
                </div>
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <div className="text-sm">
            {sigStatus === "paired" ? (
              <div className="text-emerald-700"> Prêt à signer vos factures.</div>
            ) : (
              <div className="text-amber-700"> Appairage en attente.</div>
            )}
          </div>
        )}
      </div>

      {msg && (
        <div className={cn("rounded-xl border p-3 text-sm", msg.ok ? "bg-emerald-50" : "bg-rose-50")}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
