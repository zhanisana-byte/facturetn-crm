// app/components/ttn/TTNSettingsPanel.tsx
"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

type Company = {
  id: string;
  company_name?: string;
  tax_id?: string;
};

type TTNSettingsPanelProps = {
  company: Company;
  initial: any;
  initialLogs: any[];
  context: "company" | "group";
  backHref?: string;
};

type SendMode = "api" | "manual";
type ConnectionType = "webservice" | "sftp";
type SignatureMode = "digigo" | "usb_agent" | "none";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function isBlank(v: unknown) {
  return typeof v !== "string" || v.trim().length === 0;
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1">{children}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
      {error ? <div className="mt-1 text-xs text-rose-600">{error}</div> : null}
    </label>
  );
}

function Pill({ ok, okText = "✅ Complet", koText = "⚠️ À configurer" }: { ok: boolean; okText?: string; koText?: string }) {
  return (
    <span
      className={cn(
        "text-xs px-2 py-1 rounded-full border",
        ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      )}
    >
      {ok ? okText : koText}
    </span>
  );
}

function BigFrame({
  title,
  subtitle,
  activeSummary,
  onToggle,
  isOpen,
  right,
}: {
  title: string;
  subtitle: string;
  activeSummary: string;
  onToggle: () => void;
  isOpen: boolean;
  right?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full text-left p-5 rounded-2xl transition outline-none",
          "hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-offset-2"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-semibold">{title}</div>
            <div className="text-sm opacity-70 mt-1">{subtitle}</div>
            <div className="mt-3 text-sm">
              <span className="font-medium">Sélection actuelle :</span>{" "}
              <span className="opacity-80">{activeSummary}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {right}
            <span className="text-xs opacity-70">{isOpen ? "Masquer" : "Configurer"}</span>
          </div>
        </div>
      </button>
    </div>
  );
}

function ChoiceCard({
  title,
  description,
  active,
  ok,
  onClick,
}: {
  title: string;
  description: string;
  active: boolean;
  ok: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-2xl border p-4 transition outline-none",
        active ? "ring-2 ring-offset-2" : "hover:bg-slate-50",
        "focus-visible:ring-2 focus-visible:ring-offset-2"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-sm opacity-70 mt-1">{description}</div>
        </div>
        <Pill ok={ok} okText="✅ Prêt" koText="⚠️ À compléter" />
      </div>
    </button>
  );
}

export default function TTNSettingsPanel({ company, initial, initialLogs, context, backHref }: TTNSettingsPanelProps) {
  const companyId = company?.id || "";

  // Env
  const [environment, setEnvironment] = useState<"test" | "production">(
    String(initial?.environment ?? "test") === "production" ? "production" : "test"
  );

  // ====== MODE D’ENVOI ======
  const [sendMode, setSendMode] = useState<SendMode>(String(initial?.send_mode ?? "api") === "manual" ? "manual" : "api");
  const [connectionType, setConnectionType] = useState<ConnectionType>(
    String(initial?.connection_type ?? "webservice") === "sftp" ? "sftp" : "webservice"
  );

  const [wsUrl, setWsUrl] = useState<string>(String(initial?.ws_url ?? ""));
  const [wsLogin, setWsLogin] = useState<string>(String(initial?.ws_login ?? ""));
  const [wsPassword, setWsPassword] = useState<string>(String(initial?.ws_password ?? ""));
  const [wsMatricule, setWsMatricule] = useState<string>(String(initial?.ws_matricule ?? company?.tax_id ?? ""));

  const [publicIp, setPublicIp] = useState<string>(String(initial?.public_ip ?? ""));
  const [certSerial, setCertSerial] = useState<string>(String(initial?.cert_serial_number ?? ""));
  const [certEmail, setCertEmail] = useState<string>(String(initial?.cert_email ?? ""));
  const [signerFullName, setSignerFullName] = useState<string>(String(initial?.signer_full_name ?? ""));
  const [signerEmail, setSignerEmail] = useState<string>(String(initial?.signer_email ?? ""));

  const [requireSignature, setRequireSignature] = useState<boolean>(Boolean(initial?.require_signature));

  // ====== SIGNATURE ======
  const [signatureMode, setSignatureMode] = useState<SignatureMode>(() => {
    const sp = String(initial?.signature_provider ?? "none");
    if (sp === "usb_agent") return "usb_agent";
    if (sp === "digigo") return "digigo";
    return "none";
  });

  // DigiGO (saisie minimale)
  const [digigoPhone, setDigigoPhone] = useState<string>("");
  const [digigoEmail, setDigigoEmail] = useState<string>("");
  const [digigoNationalId, setDigigoNationalId] = useState<string>("");

  // Pairing USB
  const [pairLoading, setPairLoading] = useState(false);
  const [pairInfo, setPairInfo] = useState<{ token: string; deepLinkUrl: string; expires_at: string } | null>(null);

  // UX open/close
  const [openMethod, setOpenMethod] = useState<boolean>(true);
  const [openSignature, setOpenSignature] = useState<boolean>(false);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Completeness
  const apiReady = useMemo(() => {
    if (sendMode !== "api") return false;
    if (connectionType === "webservice") {
      if (isBlank(wsUrl) || isBlank(wsLogin) || isBlank(wsPassword)) return false;
    }
    if (requireSignature && signatureMode === "none") return false;
    return true;
  }, [sendMode, connectionType, wsUrl, wsLogin, wsPassword, requireSignature, signatureMode]);

  const manualReady = useMemo(() => sendMode === "manual", [sendMode]);

  const digigoReady = useMemo(() => signatureMode === "digigo", [signatureMode]);
  const usbReady = useMemo(() => signatureMode === "usb_agent", [signatureMode]);
  const noneReady = useMemo(() => signatureMode === "none", [signatureMode]);

  const methodSummary = useMemo(() => {
    if (sendMode === "manual") return "Déclaration manuelle (export TEIF, dépôt TTN manuel)";
    // api
    const conn = connectionType === "webservice" ? "Webservice (API TTN)" : "SFTP (à venir)";
    return `Envoi direct TTN (en ligne) — ${conn}`;
  }, [sendMode, connectionType]);

  const signatureSummary = useMemo(() => {
    if (signatureMode === "digigo") return "Signature DigiGO (OTP SMS / email)";
    if (signatureMode === "usb_agent") return "Signature Clé USB (agent local Windows)";
    return "Aucune signature (TEIF non signé)";
  }, [signatureMode]);

  function validateAll(): Record<string, string> {
    const e: Record<string, string> = {};

    if (!companyId) {
      e.company = "Société invalide.";
      return e;
    }

    if (sendMode === "api") {
      if (connectionType === "webservice") {
        if (isBlank(wsUrl)) e.ws_url = "WS URL obligatoire pour l’envoi direct (API).";
        if (isBlank(wsLogin)) e.ws_login = "Login obligatoire pour l’envoi direct (API).";
        if (isBlank(wsPassword)) e.ws_password = "Password obligatoire pour l’envoi direct (API).";
      }
      if (requireSignature && signatureMode === "none") {
        e.signature_provider = "Signature obligatoire : choisissez DigiGO ou Clé USB.";
      }
    }

    if (signatureMode === "digigo") {
      const started = !isBlank(digigoPhone) || !isBlank(digigoEmail) || !isBlank(digigoNationalId);
      if (started && isBlank(digigoPhone) && isBlank(digigoEmail)) {
        e.digigo_identity = "DigiGO : téléphone OU email requis (au moins un).";
      }
    }

    return e;
  }

  async function saveAll() {
    setSaveMsg(null);
    const e = validateAll();
    setErrors(e);
    if (Object.keys(e).length) {
      setSaveMsg({ ok: false, message: "Veuillez corriger les champs obligatoires." });
      return;
    }

    setSaving(true);
    try {
      // 1) Optionnel : identité DigiGO
      if (signatureMode === "digigo") {
        const started = !isBlank(digigoPhone) || !isBlank(digigoEmail) || !isBlank(digigoNationalId);
        if (started) {
          const rId = await fetch("/api/signature/digigo/identity/save", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              phone: digigoPhone || null,
              email: digigoEmail || null,
              national_id: digigoNationalId || null,
            }),
          });
          const jId = await rId.json().catch(() => null);
          if (!rId.ok) {
            setSaveMsg({ ok: false, message: jId?.message || jId?.error || "Enregistrement DigiGO échoué." });
            return;
          }
        }
      }

      // 2) TTN credentials
      const payload: Record<string, any> = {
        company_id: companyId,
        environment,
        send_mode: sendMode,
        connection_type: connectionType,

        ws_url: wsUrl || null,
        ws_login: wsLogin || null,
        ws_password: wsPassword || null,
        ws_matricule: wsMatricule || null,

        public_ip: publicIp || null,
        cert_serial_number: certSerial || null,
        cert_email: certEmail || null,

        signer_full_name: signerFullName || null,
        signer_email: signerEmail || null,

        require_signature: !!requireSignature,

        signature_provider: signatureMode,
        signature_status: String(initial?.signature_status ?? "unconfigured") || "unconfigured",
        signature_config: initial?.signature_config ?? {},
      };

      const r = await fetch("/api/ttn/credentials/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        setSaveMsg({ ok: false, message: j?.message || j?.error || "Enregistrement TTN échoué." });
        return;
      }

      setSaveMsg({ ok: true, message: "Paramètres enregistrés." });
    } catch (err: any) {
      setSaveMsg({ ok: false, message: err?.message || "Erreur réseau." });
    } finally {
      setSaving(false);
    }
  }

  async function generatePairLink() {
    setPairInfo(null);
    setPairLoading(true);
    setSaveMsg(null);
    try {
      const r = await fetch("/api/signature/pair-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, environment }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setSaveMsg({ ok: false, message: j?.error || j?.message || "Création du lien d’appairage échouée." });
        return;
      }
      setPairInfo({ token: String(j.token), deepLinkUrl: String(j.deepLinkUrl), expires_at: String(j.expires_at) });
    } catch (e: any) {
      setSaveMsg({ ok: false, message: e?.message || "Erreur réseau." });
    } finally {
      setPairLoading(false);
    }
  }

  const envLabel = environment === "production" ? "Production" : "Test";

  const lockOtherSignature = true; // 🔒 “Autre signature” pour un autre jour

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold">{company?.company_name || "Société"}</div>
          <div className="text-sm text-slate-600 mt-1">
            Matricule fiscal : <span className="font-medium">{company?.tax_id || "—"}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Vous pouvez configurer ici la méthode d’envoi TTN et la signature électronique. Les champs de connexion ne sont requis que pour l’envoi direct (API).
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {backHref ? (
            <a className="ftn-btn-ghost" href={backHref}>
              ← Retour
            </a>
          ) : null}

          <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
            <span className="text-xs text-slate-600">Environnement</span>
            <select
              className="ftn-input !h-9 !py-1"
              value={environment}
              onChange={(e) => setEnvironment(String(e.target.value) === "production" ? "production" : "test")}
            >
              <option value="test">test</option>
              <option value="production">production</option>
            </select>
          </div>
        </div>
      </div>

      {/* BIG FRAME 1: MODE D’ENVOI */}
      <BigFrame
        title="Méthode d’envoi"
        subtitle="Choisissez comment vos factures seront transmises à la plateforme TTN."
        activeSummary={methodSummary}
        isOpen={openMethod}
        onToggle={() => setOpenMethod((v) => !v)}
        right={<Pill ok={sendMode === "manual" ? manualReady : apiReady} okText="✅ Prêt" koText="⚠️ À configurer" />}
      />

      {openMethod ? (
        <div className="rounded-2xl border p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChoiceCard
              title="🚀 Envoi direct TTN (en ligne)"
              description="Envoi automatique vers TTN via connexion sécurisée (API)."
              active={sendMode === "api"}
              ok={apiReady}
              onClick={() => setSendMode("api")}
            />
            <ChoiceCard
              title="📝 Déclaration manuelle"
              description="Export TEIF XML, puis dépôt manuel sur TTN. Aucun paramètre de connexion TTN requis."
              active={sendMode === "manual"}
              ok={manualReady}
              onClick={() => setSendMode("manual")}
            />
          </div>

          {sendMode === "manual" ? (
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="text-sm font-semibold">Déclaration manuelle</div>
              <div className="text-sm opacity-80 mt-1">
                Aucun paramètre de connexion TTN n’est requis. Vous pourrez exporter le TEIF (XML) depuis la facture et déposer le fichier manuellement sur TTN.
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Vous pouvez tout de même activer une signature (DigiGO / Clé USB) pour obtenir un TEIF signé avant dépôt manuel.
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">Envoi direct TTN — Paramètres de connexion</div>
                <div className="text-xs text-slate-600">
                  Société : <span className="font-medium">{company.company_name}</span> — {envLabel}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Field label="Connexion" hint="Webservice correspond à l’API TTN.">
                  <select
                    className="ftn-input"
                    value={connectionType}
                    onChange={(e) => setConnectionType(String(e.target.value) === "sftp" ? "sftp" : "webservice")}
                  >
                    <option value="webservice">Webservice (API TTN)</option>
                    <option value="sftp">SFTP (à venir)</option>
                  </select>
                </Field>

                <Field label="Signature obligatoire" hint="Si activé, l’envoi direct sera bloqué sans TEIF signé.">
                  <select
                    className="ftn-input"
                    value={requireSignature ? "true" : "false"}
                    onChange={(e) => setRequireSignature(String(e.target.value) === "true")}
                  >
                    <option value="false">Non</option>
                    <option value="true">Oui</option>
                  </select>
                </Field>

                <Field label="IP publique (optionnel)" hint="À renseigner si TTN impose une whitelist d’IP.">
                  <input className="ftn-input" value={publicIp} onChange={(e) => setPublicIp(e.target.value)} placeholder="ex: 41.xxx.xxx.xxx" />
                </Field>

                <Field label="Certificat (optionnel) — N° série">
                  <input className="ftn-input" value={certSerial} onChange={(e) => setCertSerial(e.target.value)} />
                </Field>

                <Field label="Certificat (optionnel) — Email">
                  <input className="ftn-input" value={certEmail} onChange={(e) => setCertEmail(e.target.value)} />
                </Field>

                <Field label="Signataire (optionnel) — Nom complet">
                  <input className="ftn-input" value={signerFullName} onChange={(e) => setSignerFullName(e.target.value)} />
                </Field>

                <Field label="Signataire (optionnel) — Email">
                  <input className="ftn-input" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
                </Field>
              </div>

              {connectionType === "webservice" ? (
                <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
                  <div className="text-sm font-semibold">Identifiants Webservice (API)</div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Field
                      label="WS URL"
                      hint="Obligatoire. Exemple : https://.../EfactService"
                      error={errors.ws_url}
                    >
                      <input
                        className={cn("ftn-input", errors.ws_url && "!border-rose-300")}
                        value={wsUrl}
                        onChange={(e) => setWsUrl(e.target.value)}
                        placeholder="https://..."
                      />
                    </Field>

                    <Field label="Login" error={errors.ws_login}>
                      <input
                        className={cn("ftn-input", errors.ws_login && "!border-rose-300")}
                        value={wsLogin}
                        onChange={(e) => setWsLogin(e.target.value)}
                        placeholder="login TTN"
                      />
                    </Field>

                    <Field label="Password" error={errors.ws_password}>
                      <input
                        className={cn("ftn-input", errors.ws_password && "!border-rose-300")}
                        type="password"
                        value={wsPassword}
                        onChange={(e) => setWsPassword(e.target.value)}
                        placeholder="password TTN"
                      />
                    </Field>

                    <Field label="Matricule fiscal" hint="Si vide, le système reprend automatiquement celui de la société.">
                      <input
                        className="ftn-input"
                        value={wsMatricule}
                        onChange={(e) => setWsMatricule(e.target.value)}
                        placeholder={company?.tax_id || "ex: 0736202XAM000"}
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border bg-amber-50 border-amber-200 p-4 text-sm text-amber-900">
                  Le mode SFTP n’est pas encore activé dans cette version. Veuillez utiliser Webservice (API TTN) pour l’envoi direct.
                </div>
              )}

              {errors.signature_provider ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                  {errors.signature_provider}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {/* BIG FRAME 2: SIGNATURE */}
      <BigFrame
        title="Signature électronique"
        subtitle="Choisissez comment vos documents TEIF seront signés."
        activeSummary={signatureSummary}
        isOpen={openSignature}
        onToggle={() => setOpenSignature((v) => !v)}
        right={<Pill ok={signatureMode !== "none"} okText="✅ Sélectionnée" koText="ℹ️ Aucune" />}
      />

      {openSignature ? (
        <div className="rounded-2xl border p-5 space-y-5">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Par défaut</span>, vous pouvez sélectionner une méthode de signature. DigiGO utilise un code OTP (SMS/email). La clé USB nécessite un agent local Windows.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ChoiceCard
              title="DigiGO (OTP SMS / email)"
              description="Signature via code OTP envoyé au signataire."
              active={signatureMode === "digigo"}
              ok={digigoReady}
              onClick={() => setSignatureMode("digigo")}
            />
            <ChoiceCard
              title="Clé USB (Agent local)"
              description="Signature via certificat sur clé USB, depuis votre PC Windows."
              active={signatureMode === "usb_agent"}
              ok={usbReady}
              onClick={() => setSignatureMode("usb_agent")}
            />
            <ChoiceCard
              title="Aucune signature"
              description="TEIF non signé. (Autorisé, selon votre processus.)"
              active={signatureMode === "none"}
              ok={noneReady}
              onClick={() => setSignatureMode("none")}
            />
          </div>

          {/* DETAILS: DIGIGO */}
          {signatureMode === "digigo" ? (
            <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">DigiGO — informations du signataire</div>
                <Pill ok={true} okText="✅ Disponible" koText="—" />
              </div>

              <div className="text-sm opacity-80">
                DigiGO enverra un code de validation (OTP) par SMS ou email lors de chaque signature. Le certificat électronique est géré par Tuntrust.
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Field label="Téléphone (OTP SMS)" hint="Renseignez un téléphone ou un email (au moins un)." error={undefined}>
                  <input className="ftn-input" value={digigoPhone} onChange={(e) => setDigigoPhone(e.target.value)} placeholder="+216..." />
                </Field>
                <Field label="Email (OTP email)" hint="Renseignez un téléphone ou un email (au moins un)." error={undefined}>
                  <input className="ftn-input" value={digigoEmail} onChange={(e) => setDigigoEmail(e.target.value)} placeholder="nom@domaine.tn" />
                </Field>
                <Field label="CIN (optionnel)" hint="Optionnel, selon votre configuration DigiGO." error={undefined}>
                  <input className="ftn-input" value={digigoNationalId} onChange={(e) => setDigigoNationalId(e.target.value)} placeholder="Identifiant" />
                </Field>
              </div>

              {errors.digigo_identity ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{errors.digigo_identity}</div>
              ) : null}

              <div className="text-xs text-slate-500">
                Remarque : vous n’avez pas besoin de saisir un “PIN” dans FactureTN. DigiGO gère la création du certificat et la validation via OTP.
              </div>
            </div>
          ) : null}

          {/* DETAILS: USB */}
          {signatureMode === "usb_agent" ? (
            <div className="rounded-2xl border bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Clé USB — Agent local Windows</div>
                <Pill ok={true} okText="✅ Disponible" koText="—" />
              </div>

              <div className="text-sm opacity-80">
                Un agent doit être installé sur votre ordinateur Windows. Cet agent a la responsabilité de lire la clé USB, accéder au certificat et signer le fichier TEIF localement, sans exposer la clé au web.
              </div>

              <div className="rounded-xl border p-3 text-sm">
                <div className="font-medium">Étapes recommandées</div>
                <ol className="list-decimal ml-5 mt-2 space-y-1 opacity-80">
                  <li>Installez l’agent sur le PC où la clé USB sera utilisée.</li>
                  <li>Cliquez sur <span className="font-medium">Générer lien d’appairage</span> ci-dessous.</li>
                  <li>Ouvrez le lien sur le PC (deep link) pour autoriser l’agent pour cette société.</li>
                </ol>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Vous pouvez remplacer ce lien par votre page réelle de téléchargement */}
                <a className="ftn-btn-ghost" href="/downloads/agent" target="_blank" rel="noreferrer">
                  Télécharger l’agent Windows
                </a>

                <button type="button" className="ftn-btn-ghost" onClick={generatePairLink} disabled={pairLoading || !companyId}>
                  {pairLoading ? "Génération..." : "Générer lien d’appairage"}
                </button>

                {pairInfo?.deepLinkUrl ? (
                  <button type="button" className="ftn-btn" onClick={() => (window.location.href = pairInfo.deepLinkUrl)}>
                    Ouvrir l’agent (deep link)
                  </button>
                ) : null}
              </div>

              {pairInfo ? (
                <div className="rounded-xl border p-3 text-sm">
                  <div className="font-semibold">Lien d’appairage (valide 5 minutes)</div>
                  <div className="mt-1 break-all text-xs text-slate-700">{pairInfo.deepLinkUrl}</div>
                  <div className="mt-2 text-xs text-slate-500">Expire : {new Date(pairInfo.expires_at).toLocaleString()}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="ftn-btn-ghost" onClick={() => navigator.clipboard.writeText(pairInfo.deepLinkUrl)}>
                      Copier le lien
                    </button>
                    <button type="button" className="ftn-btn-ghost" onClick={() => navigator.clipboard.writeText(pairInfo.token)}>
                      Copier le token
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* LOCKED OTHER SIGNATURE */}
          {lockOtherSignature ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">Autre signature (à venir)</div>
                  <div className="text-sm opacity-70 mt-1">Cette méthode de signature sera disponible ultérieurement.</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full border border-slate-200 bg-white">🔒 Verrouillé</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* SAVE BAR */}
      <div className="rounded-2xl border p-5 space-y-3">
        {saveMsg ? (
          <div
            className={cn(
              "rounded-xl border p-3 text-sm",
              saveMsg.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
            )}
          >
            {saveMsg.message}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="button" className="ftn-btn" onClick={saveAll} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <button
            type="button"
            className="ftn-btn-ghost"
            onClick={() => {
              setErrors({});
              setSaveMsg(null);
              window.location.reload();
            }}
          >
            Rafraîchir
          </button>
        </div>

        <div className="text-xs text-slate-500">
          Règles : les champs WS (URL, login, password) ne sont requis que pour l’envoi direct (API). Si “Signature obligatoire” = Oui, DigiGO ou Clé USB est requis.
        </div>
      </div>
    </div>
  );
}
