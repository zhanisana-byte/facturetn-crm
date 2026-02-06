import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoExchangeTokenForSad, verifyAndDecodeJwt } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function getInvoiceIdFromState(state: string) {
  const st = s(state);
  const invoice_id = st.includes(".") ? st.split(".")[0] : st;
  return { invoice_id, state: st };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const state = s(body.state);
  const code = s(body.code);
  const token = s(body.token);

  const oauthCode = code || token;

  if (!state) {
    return NextResponse.json({ ok: false, error: "STATE_MISSING" }, { status: 400 });
  }

  if (!oauthCode) {
    return NextResponse.json({ ok: false, error: "OAUTH_CODE_MISSING" }, { status: 400 });
  }

  try {
    try {
      verifyAndDecodeJwt(oauthCode);
    } catch {}

    const { invoice_id: invoiceFromState, state: stateStr } = getInvoiceIdFromState(state);

    const service = createServiceClient();

    let sig =
      (await service
        .from("invoice_signatures")
        .select("invoice_id, company_id, provider, state, unsigned_hash, meta")
        .eq("invoice_id", invoiceFromState)
        .maybeSingle()).data ?? null;

    if (!sig) {
      sig =
        (await service
          .from("invoice_signatures")
          .select("invoice_id, company_id, provider, state, unsigned_hash, meta")
          .filter("meta->>state", "eq", stateStr)
          .maybeSingle()).data ?? null;
    }

    if (!sig) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_CONTEXT_NOT_FOUND" }, { status: 404 });
    }

    const metaState = s((sig as any)?.meta?.state);
    if (metaState && metaState !== stateStr) {
      return NextResponse.json({ ok: false, error: "STATE_MISMATCH" }, { status: 400 });
    }

    if (s((sig as any)?.provider) && s((sig as any)?.provider) !== "digigo") {
      return NextResponse.json({ ok: false, error: "PROVIDER_MISMATCH" }, { status: 400 });
    }

    const tokenResp: any = await digigoExchangeTokenForSad(oauthCode);

    const sad = s(tokenResp?.sad || tokenResp?.SAD || tokenResp?.data?.sad || tokenResp?.data?.SAD);
    if (!sad) {
      await service
        .from("invoice_signatures")
        .update({ state: "failed", error_message: s(tokenResp?.message || "SAD_MISSING") })
        .eq("invoice_id", (sig as any).invoice_id);

      return NextResponse.json({ ok: false, error: "SAD_MISSING" }, { status: 400 });
    }

    await service
      .from("invoice_signatures")
      .update({
        state: "sad_received",
        otp_id: sad,
        meta: {
          ...(sig as any).meta,
          sad,
          token_response: tokenResp,
          received_at: new Date().toISOString(),
        },
      })
      .eq("invoice_id", (sig as any).invoice_id);

    return NextResponse.json({ ok: true, invoice_id: (sig as any).invoice_id }, { status: 200 });
  } catch (e: any) {
    const msg = s(e?.message || "DIGIGO_CALLBACK_FAILED");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
