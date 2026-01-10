import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";

export async function POST(req: Request) {
  const supabase = await createClient();
  const profile = await getProfile();
  if (!profile?.id) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const company_id = String(form.get("company_id") || "");
  const ttn_key_name = String(form.get("ttn_key_name") || "");
  const ttn_public_key = String(form.get("ttn_public_key") || "");
  const ttn_secret = String(form.get("ttn_secret") || "");

  // ✨ Pro TTN settings (par société)
  const ttn_mode = String(form.get("ttn_mode") || "provider_facturetn");
  const connection_type = String(form.get("connection_type") || "webservice");
  const environment = String(form.get("environment") || "test");
  const public_ip = String(form.get("public_ip") || "");
  const cert_serial_number = String(form.get("cert_serial_number") || "");
  const cert_email = String(form.get("cert_email") || "");
  const provider_name = String(form.get("provider_name") || "");
  const token_pack_ref = String(form.get("token_pack_ref") || "");
  const signer_full_name = String(form.get("signer_full_name") || "");
  const signer_email = String(form.get("signer_email") || "");

  // upsert by unique company_id
  const { error } = await supabase
    .from("ttn_credentials")
    .upsert(
      {
        company_id,
        ttn_key_name,
        ttn_public_key,
        ttn_secret,
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
      },
      { onConflict: "company_id" }
    );

  if (error) return NextResponse.redirect(new URL(`/companies/${company_id}?err=DB`, req.url));
  return NextResponse.redirect(new URL(`/companies/${company_id}`, req.url));
}
