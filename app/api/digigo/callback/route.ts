import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoExchangeCode, type DigigoEnv } from "@/lib/digigo/client";
import { extractJwtJti, digigoOauthTokenFromJti, digigoSignHash } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v?: string | null) {
  const x = (v ?? "").trim();
  return x.length ? x : null;
}

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getSessionByState(state: string) {
  const service = createServiceClient();
  const r = await service
    .from("digigo_sign_sessions")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (r.error) throw new Error(`SESSION_READ_FAILED:${r.error.message}`);
  return r.data;
}

async function getLatestPendingSessionByInvoiceId(invoiceId: string) {
  const service = createServiceClient();
  const r = await service
    .from("digigo_sign_sessions")
    .select("*")
    .eq("invoice_id", invoiceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (r.error) throw new Error(`SESSION_READ_FAILED:${r.error.message}`);
  return r.data;
}

async function ensureNotExpired(session: any) {
  const expiresAt = new Date(session.expires_at as any).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    const service = createServiceClient();
    await service.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
    throw new Error("SESSION_EXPIRED");
  }
}

export async function POST(req: Request) {
  const service = createServiceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const token = s(body?.token);
    const state = s(body?.state);
    const invoiceIdFromBody = s(body?.invoiceId ?? body?.invoice_id ?? body?.id);

    if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });

    const invoiceIdHint = isUuid(invoiceIdFromBody) ? invoiceIdFromBody : null;
    if (!state && !invoiceIdHint) {
      return NextResponse.json({ ok: false, error: "MISSING_STATE_OR_INVOICE_ID" }, { status: 400 });
    }

    const session = state
      ? await getSessionByState(state)
      : await getLatestPendingSessionByInvoiceId(invoiceIdHint as string);

    if (!session) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });

    if (session.status === "done") {
      return NextResponse.json({ ok: true, back_url: clean(session.back_url) || "/" }, { status: 200 });
    }

    if (session.status === "expired") {
      return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
    }

    await ensureNotExpired(session);

    const invoiceId = invoiceIdHint || s(session.invoice_id);
    if (!invoiceId || !isUuid(invoiceId)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const sigRes = await service
      .from("invoice_signatures")
      .select("*")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sigRes.error) {
      return NextResponse.json(
        { ok: false, error: "SIGNATURE_READ_FAILED", message: sigRes.error.message },
        { status: 500 }
      );
    }

    const sig = sigRes.data;
    if (!sig) return NextResponse.json({ ok: false, error: "SIGNATURE_NOT_FOUND" }, { status: 404 });

    const meta = sig.meta && typeof sig.meta === "object" ? sig.meta : {};
    const credentialId = s(meta?.credentialId || meta?.credential_id);
    const unsignedHash = s(sig.unsigned_hash);

    if (!credentialId) return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    if (!unsignedHash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

    const { jti } = extractJwtJti(token);
    const { sad } = await digigoOauthTokenFromJti({ jti });
    const { value: signatureValue } = await digigoSignHash({
      sad,
      credentialId,
      hashesBase64: [unsignedHash],
    });

    await service
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_at: new Date().toISOString(),
        signed_hash: signatureValue,
        error_message: null,
        updated_at: new Date().toISOString(),
        meta: { ...(meta as any), digigo_jti: jti },
      })
      .eq("invoice_id", invoiceId);

    await service
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        digigo_jti: jti,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    await service
      .from("invoices")
      .update({
        signature_status: "signed",
        signature_provider: "digigo",
        ttn_signed: true,
        signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    return NextResponse.json(
      { ok: true, back_url: clean(session.back_url) || `/invoices/${invoiceId}` },
      { status: 200 }
    );
  } catch (e: any) {
    const msg = clean(e?.message) || "INTERNAL_ERROR";
    try {
      const body = await req.clone().json().catch(() => ({}));
      const state = s(body?.state);
      const invoiceIdFromBody = s(body?.invoiceId ?? body?.invoice_id ?? body?.id);
      const invoiceIdHint = isUuid(invoiceIdFromBody) ? invoiceIdFromBody : null;
      if (state || invoiceIdHint) {
        const service2 = createServiceClient();
        const q = service2
          .from("digigo_sign_sessions")
          .update({ status: "failed", error_message: msg, updated_at: new Date().toISOString() });
        if (state) await q.eq("state", state);
        else if (invoiceIdHint) await q.eq("invoice_id", invoiceIdHint).eq("status", "pending");
      }
    } catch {}
    return NextResponse.json({ ok: false, error: "CALLBACK_FAILED", message: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const service = createServiceClient();

  const url = new URL(req.url);
  const code = clean(url.searchParams.get("code"));
  const state = clean(url.searchParams.get("state"));
  const error = clean(url.searchParams.get("error"));
  const errorDescription = clean(url.searchParams.get("error_description"));

  if (error) {
    return NextResponse.json(
      { ok: false, error: "DIGIGO_OAUTH_ERROR", details: { error, errorDescription } },
      { status: 400 }
    );
  }

  if (!code || !state) {
    return NextResponse.json({ ok: false, error: "MISSING_CODE_OR_STATE" }, { status: 400 });
  }

  const sessRes = await service
    .from("digigo_sign_sessions")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (sessRes.error || !sessRes.data) {
    return NextResponse.json({ ok: false, error: "INVALID_STATE" }, { status: 400 });
  }

  const session = sessRes.data;

  if (session.status !== "pending") {
    return NextResponse.json({ ok: false, error: "SESSION_NOT_PENDING" }, { status: 400 });
  }

  const expiresAt = new Date(session.expires_at as any).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    await service.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
    return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
  }

  const clientId = clean(process.env.DIGIGO_CLIENT_ID);
  const clientSecret = clean(process.env.DIGIGO_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_ENV" }, { status: 500 });
  }

  const env = (clean(session.environment) as DigigoEnv) || "test";

  const exchanged = await digigoExchangeCode({
    env,
    clientId,
    clientSecret,
    code,
  });

  if (!exchanged.ok) {
    await service
      .from("digigo_sign_sessions")
      .update({ status: "failed", error_message: exchanged.raw || "TOKEN_EXCHANGE_FAILED" })
      .eq("id", session.id);

    return NextResponse.json(
      { ok: false, error: "TOKEN_EXCHANGE_FAILED", status: exchanged.status, raw: exchanged.raw, json: exchanged.json },
      { status: 400 }
    );
  }

  const tokenPayload = exchanged.json as any;
  const jti = clean(tokenPayload?.jti) || clean(tokenPayload?.jwtId) || clean(tokenPayload?.tokenId);

  await service
    .from("digigo_sign_sessions")
    .update({
      status: "done",
      digigo_jti: jti,
      updated_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  const backUrl = clean(session.back_url);
  if (backUrl) {
    const r = new URL(backUrl);
    r.searchParams.set("state", state);
    r.searchParams.set("ok", "1");
    return NextResponse.redirect(r.toString());
  }

  return NextResponse.json({ ok: true, state, token: exchanged.json });
}
