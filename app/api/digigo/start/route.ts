import { NextResponse } from "next/server";
import crypto from "crypto";
import { digigoAuthorizeUrl, sha256Base64Utf8, type DigigoEnv } from "@/lib/digigo/client";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function getOrigin(req: Request) {
  // Vercel / reverse proxy
  const proto = s(req.headers.get("x-forwarded-proto") || "https");
  const host = s(req.headers.get("x-forwarded-host") || req.headers.get("host") || "");
  if (host) return `${proto}://${host}`;
  // fallback (si tu définis NEXT_PUBLIC_APP_URL)
  const app = s(process.env.NEXT_PUBLIC_APP_URL || "");
  return app || "";
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();

    const body = await req.json().catch(() => ({}));
    const invoiceId = s(body.invoice_id || body.invoiceId);
    const backUrl = s(body.back_url || body.backUrl);

    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    // Invoice -> company
    const invRes = await service
      .from("invoices")
      .select("id, company_id")
      .eq("id", invoiceId)
      .single();

    if (!invRes.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const companyId = s(invRes.data.company_id);

    // Company
    const compRes = await service
      .from("companies")
      .select("id, digigo_credential_id")
      .eq("id", companyId)
      .single();

    if (!compRes.data) {
      return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    }

    // Env (test/prod)
    const env = (s(process.env.DIGIGO_ENV) === "production" ? "production" : "test") as DigigoEnv;

    // Credentials TTN (pour confirmer que DigiGo est activé)
    const credRes = await service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, environment")
      .eq("company_id", companyId)
      .eq("environment", env)
      .maybeSingle();

    if (!credRes.data || s(credRes.data.signature_provider) !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg: any =
      credRes.data.signature_config && typeof credRes.data.signature_config === "object"
        ? credRes.data.signature_config
        : {};

    // IMPORTANT: credentialId peut être stocké soit dans companies.digigo_credential_id
    // soit dans ttn_credentials.signature_config
    const credentialId =
      s(compRes.data.digigo_credential_id) ||
      s(cfg.credentialId) ||
      s(cfg.digigo_credential_id) ||
      s(cfg.digigoCredentialId);

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_CREDENTIAL_ID" }, { status: 400 });
    }

    // ENV requis côté OAuth
    const clientId = s(process.env.DIGIGO_CLIENT_ID);

    // redirectUri: si non défini en ENV, on prend l’origin et on met "/" (comme ton kit de test)
    const origin = getOrigin(req);
    const redirectUri = s(process.env.DIGIGO_REDIRECT_URI) || (origin ? `${origin}/` : "");

    if (!clientId) {
      return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_CLIENT_ID" }, { status: 500 });
    }

    if (!redirectUri) {
      return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_REDIRECT_URI" }, { status: 500 });
    }

    // Session
    const state = crypto.randomUUID();

    // (Ici on garde ton logique actuelle: hash = invoiceId)
    // Si tu veux hash TEIF (XML) => on bascule cette route vers la logique de /api/digigo/start.
    const hash = sha256Base64Utf8(invoiceId);

    const ins = await service.from("digigo_sign_sessions").insert({
      invoice_id: invoiceId,
      company_id: companyId,
      state,
      back_url: backUrl || `/invoices/${invoiceId}`,
      status: "pending",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      environment: env,
    });

    if (ins.error) {
      return NextResponse.json(
        { ok: false, error: "SESSION_CREATE_FAILED", details: ins.error.message },
        { status: 500 }
      );
    }

    // URL OAuth DigiGo
    let authorize_url = "";
    try {
      authorize_url = digigoAuthorizeUrl({
        env,
        clientId,
        redirectUri,
        state,
        credentialId,
        hashBase64: hash,
        numSignatures: 1,
      });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: s(e?.message) || "AUTHORIZE_URL_FAILED" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        authorize_url,
        state,
        env,
        credentialId,
        redirectUri,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "UNKNOWN_ERROR", message: s(e?.message) }, { status: 500 });
  }
}
