import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { jwtGetJti, digigoOauthToken, digigoSignHash } from "@/lib/digigo/server";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

async function safeUpdateInvoiceSigned(service: any, invoiceId: string) {
  const payload: any = { updated_at: new Date().toISOString() };
  const tries: any[] = [
    { ...payload, signature_status: "signed" },
    { ...payload, signature_status: "signed", signature_provider: "digigo" },
    { ...payload, signature_status: "signed", signature_provider: "digigo", ttn_signed: true },
  ];
  for (const p of tries) {
    const r = await service.from("invoices").update(p).eq("id", invoiceId);
    if (!r.error) return true;
  }
  return false;
}

async function resolveCredForCompany(service: any, company_id: string, env: string) {
  const tryEnv = async (e: string) =>
    service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email, environment")
      .eq("company_id", company_id)
      .eq("environment", e)
      .maybeSingle();

  let credRes = await tryEnv(env);
  if (credRes.data) return credRes;

  const prod = await tryEnv("production");
  if (prod.data) return prod;

  return await tryEnv("test");
}

async function findLastPendingSession(service: any) {
  const nowIso = new Date().toISOString();
  const r = await service
    .from("digigo_sign_sessions")
    .select("*")
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return r.data || null;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const body = await req.json().catch(() => ({}));

    const service = createServiceClient();

    const supabase = await createClient().catch(() => null);
    const authUser = supabase ? (await supabase.auth.getUser()).data?.user : null;

    const token = s(body?.token || "");
    const codeParam = s(body?.code || "");

    const stateFromBody = s(body?.state || "");
    const stateFromCookie = s(cookieStore.get("digigo_state")?.value || "");
    let state = stateFromBody || stateFromCookie;

    const invoiceFromBody = s(body?.invoice_id || body?.invoiceId || "");
    const invoiceFromCookie = s(cookieStore.get("digigo_invoice_id")?.value || "");
    let invoice_id = invoiceFromBody || invoiceFromCookie;

    const back_url_body = s(body?.back_url || body?.backUrl || body?.back || "");
    const back_url_cookie = s(cookieStore.get("digigo_back_url")?.value || "");
    const back_url = back_url_body || back_url_cookie || "/app";

    const jti = token ? s(jwtGetJti(token)) : "";
    const code = codeParam || jti;

    if (!code) {
      return NextResponse.json({ ok: false, error: "CODE_MISSING" }, { status: 400 });
    }

    let session: any = null;

    if (state && isUuid(state)) {
      const sessRes = await service.from("digigo_sign_sessions").select("*").eq("state", state).maybeSingle();
      if (sessRes.data?.id) session = sessRes.data;
      if (!invoice_id && sessRes.data?.invoice_id) invoice_id = s(sessRes.data.invoice_id);
    }

    if (!session?.id && authUser?.id) {
      const lastRes = await service
        .from("digigo_sign_sessions")
        .select("*")
        .eq("created_by", authUser.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastRes.data?.id) {
        session = lastRes.data;
        state = state || s(session.state);
        invoice_id = invoice_id || s(session.invoice_id);
      }
    }

    if (!session?.id) {
      session = await findLastPendingSession(service);
      if (session?.id) {
        state = state || s(session.state);
        invoice_id = invoice_id || s(session.invoice_id);
      }
    }

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
    }

    if (session?.id) {
      const exp = new Date(s(session.expires_at)).getTime();
      if (!Number.isFinite(exp) || exp < Date.now()) {
        await service
          .from("digigo_sign_sessions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", session.id);
        return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
      }

      const upd: any = { updated_at: new Date().toISOString(), digigo_jti: code };
      const r = await service.from("digigo_sign_sessions").update(upd).eq("id", session.id);
      if (r?.error) {
        const msg = s(r.error.message);
        if (!msg.includes("column") || !msg.includes("digigo_jti")) {
          await service
            .from("digigo_sign_sessions")
            .update({ updated_at: new Date().toISOString(), error_message: `digigo_jti_update_failed:${msg}` })
            .eq("id", session.id);
        }
      }
    }

    const sigRes = await service
      .from("invoice_signatures")
      .select("company_id, environment, provider, state, unsigned_xml, unsigned_hash, meta")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    if (!sigRes.data) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_CONTEXT_NOT_FOUND" }, { status: 404 });
    }

    const sig: any = sigRes.data;

    let company_id = s(sig.company_id);
    if (!company_id) {
      const invRes = await service.from("invoices").select("company_id").eq("id", invoice_id).maybeSingle();
      company_id = s(invRes.data?.company_id || "");
    }

    const env = s(sig.environment || (sig.meta as any)?.environment || session?.environment || "test") || "test";
    const unsigned_xml = s(sig.unsigned_xml);
    const unsigned_hash = s(sig.unsigned_hash);

    if (!company_id || !unsigned_xml || !unsigned_hash) {
      return NextResponse.json(
        {
          ok: false,
          error: "INVALID_SIGNATURE_CONTEXT",
          details: {
            has_company_id: !!company_id,
            has_unsigned_xml: !!unsigned_xml,
            has_unsigned_hash: !!unsigned_hash,
          },
        },
        { status: 400 }
      );
    }

    const credRes = await resolveCredForCompany(service, company_id, env);

    if (!credRes.data || s((credRes.data as any).signature_provider) !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg =
      (credRes.data as any)?.signature_config && typeof (credRes.data as any).signature_config === "object"
        ? (credRes.data as any).signature_config
        : {};

    const credentialId = s(
      cfg.digigo_signer_email || cfg.credentialId || cfg.signer_email || (credRes.data as any)?.cert_email
    );

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

    const tok = await digigoOauthToken({ credentialId, code });
    if (!tok.ok) {
      if (session?.id) {
        await service
          .from("digigo_sign_sessions")
          .update({ status: "failed", error_message: s((tok as any).error), updated_at: new Date().toISOString() })
          .eq("id", session.id);
      }
      return NextResponse.json(
        { ok: false, error: "DIGIGO_TOKEN_FAILED", message: s((tok as any).error || "DIGIGO_TOKEN_FAILED") },
        { status: 400 }
      );
    }

    const sign = await digigoSignHash({ credentialId, sad: (tok as any).sad, hashes: [unsigned_hash] });
    if (!sign.ok) {
      if (session?.id) {
        await service
          .from("digigo_sign_sessions")
          .update({ status: "failed", error_message: s((sign as any).error), updated_at: new Date().toISOString() })
          .eq("id", session.id);
      }
      return NextResponse.json(
        { ok: false, error: "DIGIGO_SIGNHASH_FAILED", message: s((sign as any).error || "DIGIGO_SIGNHASH_FAILED") },
        { status: 400 }
      );
    }

    const signatureValue = s((sign as any).value);
    const signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signatureValue);
    const signed_hash = sha256Base64Utf8(signed_xml);

    await service
      .from("invoice_signatures")
      .update({
        company_id,
        environment: env,
        state: "signed",
        signed_xml,
        signed_hash,
        signed_at: new Date().toISOString(),
        meta: {
          ...(sig.meta && typeof sig.meta === "object" ? sig.meta : {}),
          credentialId,
          environment: env,
          digigo: {
            sad: (tok as any).sad,
            algorithm: s((sign as any).algorithm),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("invoice_id", invoice_id);

    await safeUpdateInvoiceSigned(service, invoice_id);

    if (session?.id) {
      await service
        .from("digigo_sign_sessions")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", session.id);
    }

    cookieStore.set("digigo_state", "", { path: "/", maxAge: 0 });
    cookieStore.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
    cookieStore.set("digigo_back_url", "", { path: "/", maxAge: 0 });

    return NextResponse.json({ ok: true, back_url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", message: String(e?.message || e) }, { status: 500 });
  }
}
