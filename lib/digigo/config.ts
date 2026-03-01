import { createServiceClient } from "@/lib/supabase/service";
import type { DigigoEnv } from "@/lib/digigo/client";

function s(v: any) {
  return String(v ?? "").trim();
}

function normalizeHost(host: string) {
  const h = s(host).toLowerCase();
  return h.replace(/^https?:\/\//, "").split("/")[0];
}

export function guessEnvFromHost(hostHeader: string | null): DigigoEnv {
  const host = normalizeHost(hostHeader || "");
  if (!host) return (s(process.env.DIGIGO_ENV) === "production" ? "production" : "test") as DigigoEnv;

  const prodHosts = (process.env.DIGIGO_PROD_HOSTS || "facturetn.com,www.facturetn.com")
    .split(",")
    .map((x) => normalizeHost(x))
    .filter(Boolean);

  if (prodHosts.includes(host)) return "production";
  return "test";
}

export async function pickCompanyDigigoEnv(companyId: string, hostHeader: string | null): Promise<DigigoEnv> {
  const svc = createServiceClient();
  const preferred = guessEnvFromHost(hostHeader);

  const preferredRow = await svc
    .from("ttn_credentials")
    .select("id")
    .eq("company_id", companyId)
    .eq("environment", preferred)
    .eq("is_active", true)
    .maybeSingle();

  if (preferredRow.data) return preferred;

  const prodRow = await svc
    .from("ttn_credentials")
    .select("id")
    .eq("company_id", companyId)
    .eq("environment", "production")
    .eq("is_active", true)
    .maybeSingle();

  if (prodRow.data) return "production";
  return "test";
}

export function resolveCredentialId(company: any, ttnCred: any): string {
  const cfg = (ttnCred?.signature_config && typeof ttnCred.signature_config === "object") ? ttnCred.signature_config : {};

  const candidate =
    s(cfg.digigo_signer_email) ||
    s(cfg.credentialId) ||
    s(cfg.digigoCredentialId) ||
    s(ttnCred?.cert_email) ||
    s(ttnCred?.signer_email) ||
    s(company?.digigo_credential_id);

  if (!candidate) return "";

  const bad =
    candidate === "VRAI_CREDENTIAL_ID_ICI" ||
    candidate.toUpperCase().includes("VRAI_CREDENTIAL") ||
    candidate.toUpperCase().includes("CREDENTIAL_ID") ||
    candidate.includes("ICI");

  if (bad) return "";
  return candidate;
}
