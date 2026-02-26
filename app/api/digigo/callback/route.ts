import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { digigoExchangeCode, type DigigoEnv } from "@/lib/digigo/client";

function clean(v?: string | null) {
  const x = (v ?? "").trim();
  return x.length ? x : null;
}

export async function GET(req: Request) {
  const supabase = await createClient();

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

  const { data: session, error: sessErr } = await supabase
    .from("digigo_sign_sessions")
    .select("id, invoice_id, company_id, status, expires_at, back_url, environment")
    .eq("state", state)
    .single();

  if (sessErr || !session) {
    return NextResponse.json({ ok: false, error: "INVALID_STATE" }, { status: 400 });
  }

  if (session.status !== "pending") {
    return NextResponse.json({ ok: false, error: "SESSION_NOT_PENDING" }, { status: 400 });
  }

  const expiresAt = new Date(session.expires_at as any).getTime();
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    await supabase.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
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
    await supabase
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

  await supabase
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
