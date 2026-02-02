import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const isBlank = (v: unknown) => typeof v !== "string" || v.trim().length === 0;
const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const hasKey = (obj: any, key: string) => obj && Object.prototype.hasOwnProperty.call(obj, key);

export async function POST(req: Request) {
  try {
    
    const supabaseUser = await createClient();
    const { data: auth } = await supabaseUser.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const supabase = createAdminClient();

    const body = await req.json().catch(() => ({} as any));

    const company_id = s(body.company_id);
    if (!company_id) return NextResponse.json({ ok: false, error: "company_id missing" }, { status: 400 });

    const environment = (s(body.environment) === "production" ? "production" : "test") as "test" | "production";

    const { data: existing, error: exErr } = await supabase
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", company_id)
      .eq("environment", environment)
      .maybeSingle();

    if (exErr) {
      return NextResponse.json({ ok: false, error: "DB_READ_FAILED", message: exErr.message }, { status: 500 });
    }

    const sendModeProvided = hasKey(body, "send_mode");
    const connectionTypeProvided = hasKey(body, "connection_type");
    const wsUrlProvided = hasKey(body, "ws_url");
    const wsLoginProvided = hasKey(body, "ws_login");
    const wsPasswordProvided = hasKey(body, "ws_password");
    const anyWsProvided = wsUrlProvided || wsLoginProvided || wsPasswordProvided;

    const requireSignatureProvided = hasKey(body, "require_signature");
    const signatureProviderProvided = hasKey(body, "signature_provider");

    const final_send_mode = (
      sendModeProvided ? (s(body.send_mode) === "manual" ? "manual" : "api") : (existing?.send_mode ?? "api")
    ) as "api" | "manual";

    const final_connection_type = (
      connectionTypeProvided ? (s(body.connection_type) === "sftp" ? "sftp" : "webservice") : (existing?.connection_type ?? "webservice")
    ) as "webservice" | "sftp";

    const signature_provider_raw = signatureProviderProvided ? s(body.signature_provider) : String(existing?.signature_provider ?? "none");
    const final_signature_provider =
      signature_provider_raw === "usb_agent" ||
      signature_provider_raw === "digigo" ||
      signature_provider_raw === "dss" ||
      signature_provider_raw === "hsm"
        ? signature_provider_raw
        : "none";

    const signature_status_raw = hasKey(body, "signature_status") ? s(body.signature_status) : String(existing?.signature_status ?? "unconfigured");
    const final_signature_status =
      signature_status_raw === "pairing" || signature_status_raw === "paired" || signature_status_raw === "error"
        ? signature_status_raw
        : "unconfigured";

    const final_signature_config = hasKey(body, "signature_config") ? (body.signature_config ?? {}) : (existing?.signature_config ?? {});
    const final_require_signature = requireSignatureProvided ? !!body.require_signature : !!(existing?.require_signature ?? false);

    const final_ws_url = wsUrlProvided ? (s(body.ws_url) || null) : (existing?.ws_url ?? null);
    const final_ws_login = wsLoginProvided ? (s(body.ws_login) || null) : (existing?.ws_login ?? null);
    const final_ws_password = wsPasswordProvided ? (s(body.ws_password) || null) : (existing?.ws_password ?? null);

    const isTouchingApiConfig = sendModeProvided || connectionTypeProvided || anyWsProvided;
    if (isTouchingApiConfig && final_send_mode === "api" && final_connection_type === "webservice") {
      if (isBlank(final_ws_url) || isBlank(final_ws_login) || isBlank(final_ws_password)) {
        return NextResponse.json(
          {
            ok: false,
            error: "TTN_INCOMPLET",
            message: "Pour le mode Direct TTN (API) + Webservice, ws_url + ws_login + ws_password sont obligatoires.",
          },
          { status: 400 }
        );
      }
    }

    const isTouchingSignatureRules = requireSignatureProvided || signatureProviderProvided;
    if (isTouchingSignatureRules && final_send_mode === "api" && final_require_signature && final_signature_provider === "none") {
      return NextResponse.json(
        { ok: false, error: "SIGNATURE_REQUIRED", message: "Signature obligatoire: choisissez DigiGO ou Clé USB." },
        { status: 400 }
      );
    }

    let final_ws_matricule: string | null = hasKey(body, "ws_matricule") ? (s(body.ws_matricule) || null) : (existing?.ws_matricule ?? null);
    if (!final_ws_matricule) {
      const { data: c } = await supabase.from("companies").select("tax_id").eq("id", company_id).maybeSingle();
      const mf = s((c as any)?.tax_id);
      final_ws_matricule = mf || null;
    }

    const payload: Record<string, any> = {
      ...(existing ?? {}),
      company_id,
      environment,

      send_mode: final_send_mode,
      connection_type: final_connection_type,

      ws_url: final_ws_url,
      ws_login: final_ws_login,
      ws_password: final_ws_password,
      ws_matricule: final_ws_matricule,

      signature_provider: final_signature_provider,
      signature_status: final_signature_status,
      signature_config: final_signature_config,

      require_signature: final_require_signature,

      created_by: existing?.created_by ?? auth.user.id,
      updated_at: new Date().toISOString(),
      is_active: true,
    };

    const { data, error } = await supabase
      .from("ttn_credentials")
      .upsert(payload, { onConflict: "company_id,environment" })
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: "DB_UPSERT_FAILED", message: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN", message: e?.message || String(e) }, { status: 500 });
  }
}
