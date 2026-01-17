import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";

export async function POST(req: Request) {
  const supabase = await createClient();
  const profile = await getProfile();
  if (!profile?.id) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();

  const company_id = String(form.get("company_id") || "");

  // Legacy direct tokens (optional)
  const ttn_key_name = String(form.get("ttn_key_name") || "");
  const ttn_public_key = String(form.get("ttn_public_key") || "");
  const ttn_secret = String(form.get("ttn_secret") || "");

  // TTN settings
  const ttn_mode = String(form.get("ttn_mode") || "provider_facturetn"); // provider_facturetn | direct_ttn_tokens
  const connection_type = String(form.get("connection_type") || "webservice"); // webservice | sftp
  const environment = String(form.get("environment") || "test"); // test | production

  // Certificate / onboarding fields
  const public_ip = String(form.get("public_ip") || "");
  const cert_serial_number = String(form.get("cert_serial_number") || "");
  const cert_email = String(form.get("cert_email") || "");
  const provider_name = String(form.get("provider_name") || "");
  const token_pack_ref = String(form.get("token_pack_ref") || "");
  const signer_full_name = String(form.get("signer_full_name") || "");
  const signer_email = String(form.get("signer_email") || "");

  // ✅ Webservice fields (WSDL / SOAP)
  const ws_url = String(form.get("ws_url") || "");
  const ws_login = String(form.get("ws_login") || "");
  const ws_password = String(form.get("ws_password") || "");
  const ws_matricule = String(form.get("ws_matricule") || "");

  // ✅ DSS signature fields (optional)
  const dss_url = String(form.get("dss_url") || "");
  const dss_token = String(form.get("dss_token") || "");
  const dss_profile = String(form.get("dss_profile") || "");
  const require_signature =
    String(form.get("require_signature") || "") === "on" ||
    String(form.get("require_signature") || "") === "true" ||
    String(form.get("require_signature") || "") === "1";

  if (!company_id) {
    return NextResponse.redirect(new URL(`/companies?err=MISSING_COMPANY`, req.url));
  }

  const payload = {
    company_id,

    // direct tokens (optional)
    ttn_key_name,
    ttn_public_key,
    ttn_secret,

    // main setup
    ttn_mode,
    connection_type,
    environment,

    public_ip,
    cert_serial_number,
    cert_email,
    provider_name,
    token_pack_ref,
    signer_full_name,
    signer_email,

    // ✅ webservice
    ws_url,
    ws_login,
    ws_password,
    ws_matricule,

    // ✅ dss
    dss_url,
    dss_token,
    dss_profile,
    require_signature,
  };

  const { error } = await supabase.from("ttn_credentials").upsert(payload, {
    onConflict: "company_id",
  });

  if (error) {
    return NextResponse.redirect(new URL(`/companies/${company_id}?err=DB_TTN_SAVE`, req.url));
  }

  return NextResponse.redirect(new URL(`/companies/${company_id}?ok=TTN_SAVED`, req.url));
}
