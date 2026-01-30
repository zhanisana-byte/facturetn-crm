"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import type { ReactNode } from "react";

type Company =
  | { id: string; company_name: string | null; tax_id: string | null }
  | null;

type TTNCreds =
  | {
      company_id: string;
      ttn_key_name: string | null;
      ttn_public_key: string | null;
      ttn_secret: string | null;

      ttn_mode: "provider_facturetn" | "direct_ttn_tokens" | null;
      connection_type: "webservice" | "sftp" | null;
      environment: "test" | "production" | null;

      public_ip: string | null;
      cert_serial_number: string | null;
      cert_email: string | null;

      provider_name: string | null;
      token_pack_ref: string | null;
      signer_full_name: string | null;
      signer_email: string | null;

      ws_url: string | null;
      ws_login: string | null;
      ws_password: string | null;
      ws_matricule: string | null;

      dss_url: string | null;
      dss_token: string | null;
      dss_profile: string | null;
      require_signature: boolean | null;
    }
  | null;

type TTNTestLog = {
  id: string;
  test_type: "fields" | "api";
  environment: "test" | "production";
  success: boolean;
  status_code: number | null;
  message: string | null;
  created_at: string;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1">{children}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </label>
  );
}

function Badge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs " +
        (ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50")
      }
    >
      {children}
    </span>
  );
}

export default function TTNSettingsClient({
  company,
  initial,
  initialLogs,
}: {
  company: Company;
  initial: TTNCreds;
  initialLogs: TTNTestLog[];
}) {
  const companyId = company?.id || initial?.company_id || "";

  // V5: flag global (bouton visible mais désactivé)
  const TTN_ENABLED = process.env.NEXT_PUBLIC_TTN_ENABLED === "1";

  const [testingFields, setTestingFields] = useState(false);
  const [testingApi, setTestingApi] = useState(false);

  const [resultFields, setResultFields] = useState<{ ok: boolean; message: string } | null>(null);
  const [resultApi, setResultApi] = useState<{ ok: boolean; message: string } | null>(null);

  const [logs, setLogs] = useState<TTNTestLog[]>(initialLogs ?? []);

  const defaults = useMemo(() => {
    return {
      // basic
      ttn_key_name: initial?.ttn_key_name || "",
      ttn_public_key: initial?.ttn_public_key || "",
      ttn_secret: initial?.ttn_secret || "",

      ttn_mode: (initial?.ttn_mode || "provider_facturetn") as "provider_facturetn" | "direct_ttn_tokens",
      connection_type: (initial?.connection_type || "webservice") as "webservice" | "sftp",
      environment: (initial?.environment || "test") as "test" | "production",

      public_ip: initial?.public_ip || "",
      cert_serial_number: initial?.cert_serial_number || "",
      cert_email: initial?.cert_email || "",

      provider_name: initial?.provider_name || "",
      token_pack_ref: initial?.token_pack_ref || "",
      signer_full_name: initial?.signer_full_name || "",
      signer_email: initial?.signer_email || "",

      // webservice
      ws_url: initial?.ws_url || "",
      ws_login: initial?.ws_login || "",
      ws_password: initial?.ws_password || "",
      // ✅ Évite la répétition: si vide, on reprend automatiquement le MF de la société
      ws_matricule: initial?.ws_matricule || company?.tax_id || "",

      // dss
      dss_url: initial?.dss_url || "",
      dss_token: initial?.dss_token || "",
      dss_profile: initial?.dss_profile || "",
      require_signature: Boolean(initial?.require_signature),
    };
  }, [initial]);

  async function refreshLogs() {
    if (!companyId) return;
    // lightweight refresh: reloading whole page is simplest, but we keep it client-side.
    // We call the fields test endpoint with a special header? no.
    // So, for now: do nothing here. Logs will appear after next navigation.
  }

  async function runTestFields() {
    setTestingFields(true);
    setResultFields(null);
    try {
      const r = await fetch(`/api/companies/${companyId}/ttn/test`, { method: "POST" });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setResultFields({ ok: false, message: j?.error || "Test champs TTN échoué." });
      } else {
        setResultFields({ ok: true, message: j?.message || "TTN: champs OK." });
      }
    } catch (e: any) {
      setResultFields({ ok: false, message: e?.message || "Erreur réseau." });
    } finally {
      setTestingFields(false);
      await refreshLogs();
    }
  }

  async function runTestApi() {
    if (!TTN_ENABLED) {
      setResultApi({ ok: false, message: "TTN en attente d’activation (flag global OFF)." });
      return;
    }
    setTestingApi(true);
    setResultApi(null);
    try {
      const r = await fetch(`/api/companies/${companyId}/ttn/test-api`, { method: "POST" });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        setResultApi({ ok: false, message: j?.error || j?.message || "Test API TTN échoué." });
      } else {
        setResultApi({ ok: true, message: j?.message || "API TTN: OK." });
      }
    } catch (e: any) {
      setResultApi({ ok: false, message: e?.message || "Erreur réseau." });
    } finally {
      setTestingApi(false);
      await refreshLogs();
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="Société"
        subtitle="Les paramètres TTN sont obligatoires par société (accès et signature)."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">{company?.company_name || "Société"}</div>
            <div className="text-sm text-slate-600">Matricule fiscal: {company?.tax_id || "—"}</div>
          </div>
          <Link className="ftn-btn-ghost" href={`/companies/${companyId}`}>
            ← Retour
          </Link>
        </div>
      </Card>

      <Card
        title="Paramètres TTN (El Fatoora)"
        subtitle="Configurer le mode, l'environnement, Webservice/SFTP, et la signature DSS."
      >
        <form action="/companies/ttn/save" method="post" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <input type="hidden" name="company_id" value={companyId} />

          <Field
            label="Mode"
            hint="provider_facturetn = votre backend envoie pour vous. direct_ttn_tokens = vous stockez les tokens/clé TTN."
          >
            <select className="ftn-input" name="ttn_mode" defaultValue={defaults.ttn_mode}>
              <option value="provider_facturetn">provider_facturetn</option>
              <option value="direct_ttn_tokens">direct_ttn_tokens</option>
            </select>
          </Field>

          <Field label="Connexion" hint="TTN propose Webservice (API) ou SFTP.">
            <select className="ftn-input" name="connection_type" defaultValue={defaults.connection_type}>
              <option value="webservice">webservice</option>
              <option value="sftp">sftp</option>
            </select>
          </Field>

          <Field label="Environnement" hint="Test d'abord, puis production après validation TTN.">
            <select className="ftn-input" name="environment" defaultValue={defaults.environment}>
              <option value="test">test</option>
              <option value="production">production</option>
            </select>
          </Field>

          <Field label="IP publique" hint="Souvent l'IP fixe de votre serveur (whitelist TTN).">
            <input className="ftn-input" name="public_ip" defaultValue={defaults.public_ip} placeholder="ex: 41.xxx.xxx.xxx" />
          </Field>

          <Field label="Certificat ANCE - N° série">
            <input className="ftn-input" name="cert_serial_number" defaultValue={defaults.cert_serial_number} />
          </Field>

          <Field label="Certificat ANCE - Email">
            <input className="ftn-input" name="cert_email" defaultValue={defaults.cert_email} />
          </Field>

          <Field label="Signataire - Nom complet">
            <input className="ftn-input" name="signer_full_name" defaultValue={defaults.signer_full_name} />
          </Field>

          <Field label="Signataire - Email">
            <input className="ftn-input" name="signer_email" defaultValue={defaults.signer_email} />
          </Field>

          <div className="lg:col-span-2">
            <div className="mt-2 mb-2 text-sm font-semibold">Identifiants TTN</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Field label="ttn_key_name">
                <input className="ftn-input" name="ttn_key_name" defaultValue={defaults.ttn_key_name} />
              </Field>
              <Field label="ttn_public_key">
                <input className="ftn-input" name="ttn_public_key" defaultValue={defaults.ttn_public_key} />
              </Field>
              <Field label="ttn_secret">
                <input className="ftn-input" name="ttn_secret" defaultValue={defaults.ttn_secret} />
              </Field>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="mt-2 mb-2 text-sm font-semibold">Option fournisseur (si applicable)</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Field label="provider_name">
                <input className="ftn-input" name="provider_name" defaultValue={defaults.provider_name} />
              </Field>
              <Field label="token_pack_ref">
                <input className="ftn-input" name="token_pack_ref" defaultValue={defaults.token_pack_ref} />
              </Field>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="mt-4 mb-2 text-sm font-semibold">Webservice TTN (SOAP)</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Field label="WS URL" hint="Optionnel: si vide, on utilise TTN_WS_URL_TEST/TTN_WS_URL_PROD (Vercel env).">
                <input
                  className="ftn-input"
                  name="ws_url"
                  defaultValue={defaults.ws_url}
                  placeholder="https://elfatoora.tn/ElfatouraServices/EfactService"
                />
              </Field>
              <Field label="Login">
                <input className="ftn-input" name="ws_login" defaultValue={defaults.ws_login} placeholder="login TTN" />
              </Field>
              <Field label="Password">
                <input
                  className="ftn-input"
                  type="password"
                  name="ws_password"
                  defaultValue={defaults.ws_password}
                  placeholder="password TTN"
                />
              </Field>
              <Field label="Matricule (fiscal)">
                <input className="ftn-input" name="ws_matricule" defaultValue={defaults.ws_matricule} placeholder="ex: 0736202XAM000" />
              </Field>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="mt-4 mb-2 text-sm font-semibold">Signature (DSS / ANCE)</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Field label="DSS URL">
                <input className="ftn-input" name="dss_url" defaultValue={defaults.dss_url} placeholder="https://.../sign" />
              </Field>
              <Field label="DSS Token">
                <input className="ftn-input" type="password" name="dss_token" defaultValue={defaults.dss_token} placeholder="token" />
              </Field>
              <Field label="Profile / Key alias">
                <input className="ftn-input" name="dss_profile" defaultValue={defaults.dss_profile} placeholder="PROFILE_ANCE" />
              </Field>

              <Field label="Signature obligatoire" hint="Si activé: bloque l'envoi TTN sans TEIF signé.">
                <select className="ftn-input" name="require_signature" defaultValue={defaults.require_signature ? "true" : "false"}>
                  <option value="false">Non</option>
                  <option value="true">Oui</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-wrap gap-3 pt-4">
            <button type="submit" className="ftn-btn">
              Enregistrer
            </button>

            <button type="button" className="ftn-btn-ghost" onClick={runTestFields} disabled={!companyId || testingFields}>
              {testingFields ? "Test champs..." : "Tester les champs"}
            </button>

            <button
              type="button"
              className="ftn-btn-ghost"
              onClick={runTestApi}
              disabled={!companyId || testingApi || !TTN_ENABLED}
            >
              {testingApi ? "Test API..." : "Tester l'API TTN"}
            </button>

            {!TTN_ENABLED ? (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Badge ok={false}>TTN en attente d’activation</Badge>
                <span>Active NEXT_PUBLIC_TTN_ENABLED=1 quand vous veux passer au test.</span>
              </div>
            ) : null}
          </div>

          {resultFields ? (
            <div
              className={
                "lg:col-span-2 mt-2 rounded-xl border p-3 text-sm " +
                (resultFields.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50")
              }
            >
              <div className="font-semibold">Résultat: Champs</div>
              <div className="mt-1">{resultFields.message}</div>
            </div>
          ) : null}

          {resultApi ? (
            <div
              className={
                "lg:col-span-2 mt-2 rounded-xl border p-3 text-sm " +
                (resultApi.ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50")
              }
            >
              <div className="font-semibold">Résultat: API TTN</div>
              <div className="mt-1">{resultApi.message}</div>
              <div className="mt-2 text-xs text-slate-600">
                Note: l'URL est lue depuis TTN_WS_URL_TEST / TTN_WS_URL_PROD (Vercel). Le champ WS URL sert uniquement de fallback.
                {" "}Mode: {process.env.NEXT_PUBLIC_TTN_ENABLED === "1" ? "activé" : "désactivé"}.
              </div>
            </div>
          ) : null}
        </form>
      </Card>

      <Card title="Historique des tests" subtitle="Dernières tentatives (champs / API).">
        {logs.length ? (
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge ok={l.success}>{l.success ? "OK" : "KO"}</Badge>
                  <span className="font-semibold">{l.test_type.toUpperCase()}</span>
                  <span className="text-slate-600">env: {l.environment}</span>
                  {typeof l.status_code === "number" ? (
                    <span className="text-slate-600">status: {l.status_code}</span>
                  ) : null}
                </div>
                <div className="text-slate-500 text-xs">{new Date(l.created_at).toLocaleString()}</div>
                {l.message ? <div className="w-full text-slate-700">{l.message}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-600">Aucun test enregistré pour l'instant.</div>
        )}

        <div className="mt-3 text-xs text-slate-500">
          Astuce: après un test, rafraîchir la page pour voir le log (si vous venez de créer la table et les policies).
        </div>
      </Card>
    </div>
  );
}
