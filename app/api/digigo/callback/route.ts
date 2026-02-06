import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoExchangeTokenForSad, digigoSignHash } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function decodeJwtPayload(token: string): any | null {
  const parts = s(token).split(".");
  if (parts.length < 2) return null;
  try {
    const part = parts[1];
    const pad = part.length % 4 ? "=".repeat(4 - (part.length % 4)) : "";
    const b64 = (part + pad).replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function resolveStateFromToken(token: string) {
  const payload = decodeJwtPayload(token);
  const email = s(payload?.sub);
  if (!email) return { ok: false as const, error: "TOKEN_SUB_MISSING" };

  const service = createServiceClient();

  const { data: ident, error: identErr } = await service
    .from("user_digigo_identities")
    .select("user_id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  if (identErr) return { ok: false as const, error: "IDENTITY_LOOKUP_FAILED" };
  const userId = s(ident?.user_id);
  if (!userId) return { ok: false as const, error: "IDENTITY_NOT_FOUND" };

  const { data: sig, error: sigErr } = await service
    .from("invoice_signatures")
    .select("invoice_id, meta, state, signed_at")
    .eq("provider", "digigo")
    .eq("signer_user_id", userId)
    .in("state", ["pending_auth", "token_exchange"])
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sigErr) return { ok: false as const, error: "SIGNATURE_LOOKUP_FAILED" };

  const invoice_id = s(sig?.invoice_id);
  const metaState = s((sig as any)?.meta?.state);

  if (!invoice_id) return { ok: false as const, error: "PENDING_SIGNATURE_NOT_FOUND" };

  return { ok: true as const, invoice_id, state: metaState };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const token = s(body.token);
  const code = s(body.code);
  let state = s(body.state);
  const invoice_id_from_body = s(body.invoice_id);

  if ((!token && !code) || (!state && !invoice_id_from_body && !token)) {
    return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
  }

  const oauthToken = code || token;

  let invoice_id = "";
  if (state) invoice_id = s(state.split(".")[0]);
  if (!invoice_id && invoice_id_from_body) invoice_id = invoice_id_from_body;

  if (!state && token) {
    const resolved = await resolveStateFromToken(token);
    if (!resolved.ok) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
    }
    invoice_id = resolved.invoice_id;
    if (resolved.state) state = resolved.state;
  }

  if (!invoice_id) {
    return NextResponse.json({ ok: false, error: "STATE_INVALID" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: sig, error: sigErr } = await service
    .from("invoice_signatures")
    .select("invoice_id, company_id, unsigned_hash, state, meta")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  if (sigErr) {
    return NextResponse.json({ ok: false, error: "DB_ERROR", message: s(sigErr.message) }, { status: 500 });
  }

  if (!sig) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_CONTEXT_NOT_FOUND" }, { status: 404 });
  }

  const meta = (sig as any)?.meta ?? {};
  const metaState = s(meta.state);

  if (state && metaState && metaState !== state) {
    const canHeal =
      !metaState || metaState === "test" || metaState === "STATE_TEST" || metaState === "state_test";

    if (!canHeal) {
      return NextResponse.json({ ok: false, error: "STATE_MISMATCH" }, { status: 400 });
    }

    await service.from("invoice_signatures").update({ meta: { ...meta, state } }).eq("invoice_id", invoice_id);
  }

  await service
    .from("invoice_signatures")
    .update({
      state: "token_exchange",
      meta: { ...meta, callback_received_at: new Date().toISOString(), state: state || metaState },
    })
    .eq("invoice_id", invoice_id);

  let sadResp: any;
  try {
    sadResp = await digigoExchangeTokenForSad(oauthToken);
  } catch (e: any) {
    await service
      .from("invoice_signatures")
      .update({
        state: "token_failed",
        meta: {
          ...meta,
          state: state || metaState,
          token_error: s(e?.message || "TOKEN_ERROR"),
          token_data: e?.data ?? null,
        },
      })
      .eq("invoice_id", invoice_id);

    return NextResponse.json({ ok: false, error: s(e?.message || "TOKEN_ERROR") }, { status: 502 });
  }

  const sad = s(sadResp?.sad);
  if (!sad) {
    await service
      .from("invoice_signatures")
      .update({
        state: "token_failed",
        meta: { ...meta, state: state || metaState, token_error: "SAD_MISSING", token_data: sadResp ?? null },
      })
      .eq("invoice_id", invoice_id);

    return NextResponse.json({ ok: false, error: "SAD_MISSING" }, { status: 502 });
  }

  const credentialId = s(meta.credentialId);
  const unsigned_hash = s((sig as any)?.unsigned_hash);

  if (!credentialId || !unsigned_hash) {
    await service
      .from("invoice_signatures")
      .update({ state: "sign_failed", meta: { ...meta, state: state || metaState, sign_error: "MISSING_CONTEXT" } })
      .eq("invoice_id", invoice_id);

    return NextResponse.json({ ok: false, error: "MISSING_CONTEXT" }, { status: 400 });
  }

  let signResp: any;
  try {
    signResp = await digigoSignHash({
      credentialId,
      sad,
      hashAlgo: s(meta.hashAlgo || "SHA256"),
      signAlgo: s(meta.signAlgo || "RS256"),
      hashesBase64: [unsigned_hash],
    });
  } catch (e: any) {
    await service
      .from("invoice_signatures")
      .update({
        state: "sign_failed",
        meta: {
          ...meta,
          state: state || metaState,
          sign_error: s(e?.message || "SIGN_ERROR"),
          sign_data: e?.data ?? null,
        },
      })
      .eq("invoice_id", invoice_id);

    return NextResponse.json({ ok: false, error: s(e?.message || "SIGN_ERROR") }, { status: 502 });
  }

  const signedValue =
    s(signResp?.value?.[0]) ||
    s(signResp?.value) ||
    s(signResp?.values?.[0]) ||
    "";

  await service
    .from("invoice_signatures")
    .update({
      state: "signed",
      signed_hash: signedValue || null,
      meta: { ...meta, state: state || metaState, digigo_sign: signResp ?? null, sad },
    })
    .eq("invoice_id", invoice_id);

  await service
    .from("invoices")
    .update({
      signature_status: "signed",
      signature_provider: "digigo",
    })
    .eq("id", invoice_id);

  return NextResponse.json({ ok: true, invoice_id }, { status: 200 });
}
