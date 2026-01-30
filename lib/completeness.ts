export type Completeness = {
  ok: boolean;
  missing: string[];
};

// Identité société minimale pour être "TEIF/TTN ready".
// (On garde volontairement cette liste courte mais structurée.)
export function companyCompleteness(company: {
  company_name?: string | null;
  tax_id?: string | null;
  address?: string | null;
  city?: string | null;
  governorate?: string | null;
  postal_code?: string | null;
  country?: string | null;
}): Completeness {
  const missing: string[] = [];

  if (!company?.company_name) missing.push("Nom de la société");
  if (!company?.tax_id) missing.push("Matricule fiscal");
  if (!company?.address) missing.push("Adresse (ligne)");
  if (!company?.city) missing.push("Ville");
  if (!company?.governorate) missing.push("Gouvernorat");
  if (!company?.postal_code) missing.push("Code postal");
  if (!company?.country) missing.push("Pays (ISO)");

  return { ok: missing.length === 0, missing };
}

/**
 * TTN — complétude selon le mode + type de connexion
 * - ttn_mode = 'direct_ttn_tokens' => ttn_key_name / ttn_public_key / ttn_secret
 * - sinon (provider_facturetn) :
 *    - connection_type = 'webservice' => ws_url/ws_login/ws_password/ws_matricule
 *    - connection_type = 'sftp'      => public_ip + token_pack_ref (souvent requis)
 */
export function ttnCompleteness(ttn: any): Completeness {
  const missing: string[] = [];

  if (!ttn) return { ok: false, missing: ["Paramètres TTN non configurés"] };

  const ttnMode = String(ttn.ttn_mode ?? "provider_facturetn").toLowerCase();
  const connectionType = String(ttn.connection_type ?? "webservice").toLowerCase();

  if (!ttn.environment) missing.push("Environnement");
  if (!ttn.connection_type) missing.push("Type de connexion");
  if (!ttn.ttn_mode) missing.push("Mode TTN");

  if (ttnMode === "direct_ttn_tokens") {
    if (!ttn.ttn_key_name) missing.push("Nom de clé");
    if (!ttn.ttn_public_key) missing.push("Clé publique");
    if (!ttn.ttn_secret) missing.push("Secret");
  } else if (connectionType === "webservice") {
    if (!ttn.ws_url) missing.push("WS URL");
    if (!ttn.ws_login) missing.push("WS login");
    if (!ttn.ws_password) missing.push("WS password");
    if (!ttn.ws_matricule) missing.push("WS matricule");
  } else if (connectionType === "sftp") {
    if (!ttn.public_ip) missing.push("IP publique");
    if (!ttn.token_pack_ref) missing.push("Référence pack / token");
  }

  if (ttn.require_signature) {
    if (!ttn.dss_url) missing.push("DSS URL");
    if (!ttn.dss_token) missing.push("DSS token");
    if (!ttn.cert_serial_number) missing.push("N° certificat");
    if (!ttn.cert_email) missing.push("Email certificat");
    if (!ttn.signer_full_name) missing.push("Nom signataire");
    if (!ttn.signer_email) missing.push("Email signataire");
  }

  return { ok: missing.length === 0, missing };
}
