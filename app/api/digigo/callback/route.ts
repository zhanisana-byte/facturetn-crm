import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoExchangeTokenForSad, digigoSignHash, verifyAndDecodeJwt } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const token = s(body.token);
  const state = s(body.state);

  if (!token || !state) return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });

  const invoice_id = s(state.split(".")[0]);
  if (!invoice_id) return NextResponse.json({ ok: false, error: "STATE_INVALID" }, { status: 400 });

  const service = createServiceClient();

  const { data: sig } = await service
    .from("invoice_signatures")
    .select("invoice_id, company_id, unsigned_hash, meta")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  if (!sig) return NextResponse.json({ ok: false, error: "SIGNATURE_CONTEXT_NOT_FOUND" }, { status: 404 });

  const meta = (sig as any)?.meta ?? {};
  if (s(meta.state) !== state) return NextResponse.json({ ok: false, error: "STATE_MISMATCH" }, { status: 400 });

  let jwt: any;
  try {
    jwt = verifyAndDecodeJwt(token);
  } catch (e: any) {
    await service
      .from("invoice_signatures")
      .update({ state: "auth_failed", meta: { ...meta, jwt_error: s(e?.message || "JWT_ERROR") } })
      .eq("invoice_id", invoice_id);
    return NextResponse.json({ ok: false, error: s(e?.message || "JWT_ERROR") }, { status: 400 });
  }

  const code = s(jwt?.payload?.jti);
  if (!code) {
    await service
      .from("invoice_signatures")
      .update({ state: "auth_failed", meta: { ...meta, jwt_error: "JWT_JTI_MISSING" } })
      .eq("invoice_id", invoice_id);
    return NextResponse.json({ ok: false, error: "JWT_JTI_MISSING" }, { status: 400 });
  }

  let sadResp: any;
  try {
    sadResp = await digigoExchangeTokenForSad(code);
  } catch (e: any) {
    await service
      .from("invoice_signatures")
      .update({
        state: "token_failed",
        meta: { ...meta, token_error: s(e?.message || "TOKEN_ERROR"), token_data: e?.data ?? null },
      })
      .eq("invoice_id", invoice_id);
    return NextResponse.json({ ok: false, error: s(e?.message || "TOKEN_ERROR") }, { status: 502 });
  }

  const sad = s(sadResp?.sad);
  if (!sad) {
    await service
      .from("invoice_signatures")
      .update({ state: "token_failed", meta: { ...meta, token_error: "SAD_MISSING", token_data: sadResp ?? null } })
      .eq("invoice_id", invoice_id);
    return NextResponse.json({ ok: false, error: "SAD_MISSING" }, { status: 502 });
  }

  const credentialId = s(meta.credentialId);
  const unsigned_hash = s((sig as any)?.unsigned_hash);

  if (!credentialId || !unsigned_hash) {
    await service
      .from("invoice_signatures")
      .update({ state: "sign_failed", meta: { ...meta, sign_error: "MISSING_CONTEXT" } })
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
        meta: { ...meta, sign_error: s(e?.message || "SIGN_ERROR"), sign_data: e?.data ?? null },
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
      meta: { ...meta, digigo_sign: signResp ?? null },
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
