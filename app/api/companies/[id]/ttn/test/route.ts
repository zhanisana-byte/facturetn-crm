import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function logTest(
  supabase: any,
  payload: {
    company_id: string;
    user_id: string;
    environment: "test" | "production";
    success: boolean;
    status_code?: number | null;
    message?: string | null;
  }
) {
  try {
    await supabase.from("ttn_test_logs").insert({
      company_id: payload.company_id,
      user_id: payload.user_id,
      test_type: "fields",
      environment: payload.environment,
      success: payload.success,
      status_code: payload.status_code ?? null,
      message: payload.message ?? null,
    });
  } catch {
    // ignore
  }
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user)
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });

  const { data: cred, error: credErr } = await supabase
    .from("ttn_credentials")
    .select(
      [
        "company_id",
        "ttn_mode",
        "connection_type",
        "environment",
        "public_ip",
        "cert_serial_number",
        "cert_email",
        "provider_name",
        "token_pack_ref",
        "signer_full_name",
        "signer_email",
        "ttn_key_name",
        "ttn_public_key",
        "ttn_secret",
        "ws_url",
        "ws_login",
        "ws_password",
        "ws_matricule",
        "dss_url",
        "dss_token",
        "dss_profile",
        "require_signature",
      ].join(",")
    )
    .eq("company_id", id)
    .maybeSingle();

  if (credErr)
    return NextResponse.json({ ok: false, error: "Erreur DB (ttn_credentials)." }, { status: 500 });
  if (!cred)
    return NextResponse.json({ ok: false, error: "Paramètres TTN non configurés." }, { status: 400 });

  const environment =
    (String((cred as any).environment || "test") === "production" ? "production" : "test") as
      | "test"
      | "production";

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id,company_name,tax_id,address,city")
    .eq("id", id)
    .maybeSingle();

  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });

  const missing: string[] = [];

  if (!company) missing.push("company");
  else {
    if (!company.company_name) missing.push("company_name");
    if (!company.tax_id) missing.push("company_tax_id");
    if (!(company.address || company.city)) missing.push("company_address_or_city");
  }

  // onboarding required (minimum recommended)
  if (!(cred as any).public_ip) missing.push("public_ip");
  if (!(cred as any).cert_serial_number) missing.push("cert_serial_number");
  if (!(cred as any).cert_email) missing.push("cert_email");
  if (!(cred as any).signer_full_name) missing.push("signer_full_name");
  if (!(cred as any).signer_email) missing.push("signer_email");

  const connectionType = String((cred as any).connection_type || "");
  const ttnMode = String((cred as any).ttn_mode || "");

  if (connectionType === "webservice") {
    if (!(cred as any).ws_login) missing.push("ws_login");
    if (!(cred as any).ws_password) missing.push("ws_password");
    if (!(cred as any).ws_matricule && !(company as any)?.tax_id)
      missing.push("ws_matricule_or_company_tax_id");

    if (ttnMode === "direct_ttn_tokens") {
      if (!(cred as any).ttn_key_name) missing.push("ttn_key_name");
      if (!(cred as any).ttn_public_key) missing.push("ttn_public_key");
      if (!(cred as any).ttn_secret) missing.push("ttn_secret");
    }
  } else if (connectionType !== "sftp") {
    missing.push("connection_type");
  }

  if ((cred as any).require_signature === true) {
    if (!(cred as any).dss_url) missing.push("dss_url");
    if (!(cred as any).dss_token) missing.push("dss_token");
    if (!(cred as any).dss_profile) missing.push("dss_profile");
  }

  if (missing.length) {
    const msg = `Configuration TTN incomplète: ${missing.join(", ")}`;
    await logTest(supabase, {
      company_id: id,
      user_id: auth.user.id,
      environment,
      success: false,
      status_code: 400,
      message: msg,
    });
    return NextResponse.json({ ok: false, error: msg, missing }, { status: 400 });
  }

  await logTest(supabase, {
    company_id: id,
    user_id: auth.user.id,
    environment,
    success: true,
    status_code: 200,
    message: "TTN: champs OK.",
  });

  return NextResponse.json({ ok: true, message: "TTN: champs OK." });
}
