import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const form = await req.formData();
  const companyId = String(form.get("company_id") ?? "").trim();
  const environment = String(form.get("environment") ?? "test").trim() || "test";

  if (!companyId) {
    return NextResponse.redirect(new URL(`/companies?ttn_error=missing_company`, req.url));
  }

  const s = (key: string) => {
    const v = form.get(key);
    const str = v === null ? "" : String(v);
    const trimmed = str.trim();
    return trimmed.length ? trimmed : null;
  };

  const b = (key: string) => {
    const v = form.get(key);
    if (v === null) return false;
    const str = String(v).toLowerCase();
    return str === "1" || str === "true" || str === "on" || str === "yes";
  };

  const payload: Record<string, any> = {
    company_id: companyId,
    environment,

    ttn_key_name: s("ttn_key_name"),
    ttn_public_key: s("ttn_public_key"),
    ttn_secret: s("ttn_secret"),

    ttn_mode: s("ttn_mode") ?? "provider_facturetn",
    connection_type: s("connection_type") ?? "webservice",
    public_ip: s("public_ip"),
    cert_serial_number: s("cert_serial_number"),
    cert_email: s("cert_email"),
    provider_name: s("provider_name"),
    token_pack_ref: s("token_pack_ref"),
    signer_full_name: s("signer_full_name"),
    signer_email: s("signer_email"),

    ws_url: s("ws_url"),
    ws_login: s("ws_login"),
    ws_password: s("ws_password"),
    
    ws_matricule: s("ws_matricule"),

    dss_url: s("dss_url"),
    dss_token: s("dss_token"),
    dss_profile: s("dss_profile"),
    require_signature: b("require_signature"),

    updated_at: new Date().toISOString(),
  };

  if (!payload.ws_matricule) {
    const { data: c } = await supabase
      .from("companies")
      .select("tax_id")
      .eq("id", companyId)
      .maybeSingle();
    const mf = String((c as any)?.tax_id ?? "").trim();
    payload.ws_matricule = mf.length ? mf : null;
  }

  const { error } = await supabase
    .from("ttn_credentials")
    .upsert(payload, { onConflict: "company_id,environment" });

  const url = new URL(`/companies/${companyId}/ttn?saved=1&env=${encodeURIComponent(environment)}`, req.url);

  if (error) {
    url.searchParams.set("saved", "0");
    url.searchParams.set("error", "db");
    url.searchParams.set("message", error.message);
  }

  return NextResponse.redirect(url);
}
