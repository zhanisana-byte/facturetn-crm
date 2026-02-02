import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consultEfactSOAP } from "@/lib/ttn/webservice";
import { getTTNMode, isTTNEnabled, testTTNApi } from "@/lib/ttn/ttn.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getWsUrl(environment: string | null | undefined, fallback?: string | null) {
  const env = String(environment || "").toLowerCase();
  const fromEnv = env === "production" ? process.env.TTN_WS_URL_PROD : process.env.TTN_WS_URL_TEST;
  const url = (fromEnv || "").trim() || String(fallback || "").trim();
  return url;
}

function brief(text: string, max = 240) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

async function logTest(
  supabase: any,
  payload: {
    company_id: string;
    user_id: string;
    test_type: "api" | "fields";
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
      test_type: payload.test_type,
      environment: payload.environment,
      success: payload.success,
      status_code: payload.status_code ?? null,
      message: payload.message ?? null,
    });
  } catch {
    
  }
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });
  }

  const { data: cred, error: credErr } = await supabase
    .from("ttn_credentials")
    .select(
      [
        "company_id",
        "environment",
        "connection_type",
        "ws_url",
        "ws_login",
        "ws_password",
        "ws_matricule",
      ].join(",")
    )
    .eq("company_id", id)
    .maybeSingle();

  if (credErr) {
    return NextResponse.json({ ok: false, error: "Erreur DB (ttn_credentials)." }, { status: 500 });
  }
  if (!cred) {
    return NextResponse.json({ ok: false, error: "Paramètres TTN non configurés." }, { status: 400 });
  }

  const environment = (String((cred as any).environment || "test") === "production" ? "production" : "test") as
    | "test"
    | "production";

  const connectionType = String((cred as any).connection_type || "");
  if (connectionType !== "webservice") {
    await logTest(supabase, {
      company_id: id,
      user_id: auth.user.id,
      test_type: "api",
      environment,
      success: false,
      status_code: 400,
      message: "Connexion TTN: uniquement Webservice pour le test API.",
    });
    return NextResponse.json(
      { ok: false, error: "Connexion TTN: uniquement Webservice pour le test API." },
      { status: 400 }
    );
  }

  const wsLogin = String((cred as any).ws_login || "").trim();
  const wsPassword = String((cred as any).ws_password || "").trim();
  const wsMatricule = String((cred as any).ws_matricule || "").trim();

  const wsUrl = getWsUrl(environment, (cred as any).ws_url);

  const missing: string[] = [];
  if (!wsUrl) missing.push("TTN_WS_URL_(TEST/PROD) ou ws_url");
  if (!wsLogin) missing.push("ws_login");
  if (!wsPassword) missing.push("ws_password");
  if (!wsMatricule) missing.push("ws_matricule");

  if (missing.length) {
    const msg = `Paramètres manquants: ${missing.join(", ")}`;
    await logTest(supabase, {
      company_id: id,
      user_id: auth.user.id,
      test_type: "api",
      environment,
      success: false,
      status_code: 400,
      message: msg,
    });
    return NextResponse.json({ ok: false, error: msg, missing }, { status: 400 });
  }

  const mode = getTTNMode();
  if (!isTTNEnabled() || mode === "mock") {
    const sim = await testTTNApi({
      environment,
      wsUrl,
      wsLogin,
      wsPassword,
      wsMatricule,
    });

    await logTest(supabase, {
      company_id: id,
      user_id: auth.user.id,
      test_type: "api",
      environment,
      success: sim.ok,
      status_code: sim.ok ? 200 : sim.code === "NOT_ENABLED" ? 403 : 400,
      message: sim.message,
    });

    return NextResponse.json(sim, { status: sim.ok ? 200 : sim.code === "NOT_ENABLED" ? 403 : 400 });
  }

  try {
    const res = await consultEfactSOAP(
      { url: wsUrl, login: wsLogin, password: wsPassword, matricule: wsMatricule },
      { documentType: "F" }
    );

    const ok = !!res.ok;
    const message = ok
      ? `API TTN joignable (${environment}).`
      : `Réponse TTN reçue mais non OK (${res.status}). ${brief(res.raw)}`;

    await logTest(supabase, {
      company_id: id,
      user_id: auth.user.id,
      test_type: "api",
      environment,
      success: ok,
      status_code: res.status,
      message,
    });

    return NextResponse.json(
      {
        ok,
        status: res.status,
        message,
      },
      { status: ok ? 200 : 502 }
    );
  } catch (e: any) {
    const message = e?.message ? String(e.message) : "Erreur réseau.";

    await logTest(supabase, {
      company_id: id,
      user_id: auth.user.id,
      test_type: "api",
      environment,
      success: false,
      status_code: 0,
      message,
    });

    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
