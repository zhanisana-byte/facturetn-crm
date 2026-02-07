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
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * 🔑 RÉSOLUTION FINALE
 * - indépendante de l’utilisateur
 * - basée sur la SIGNATURE EN COURS (facture / société)
 */
async function resolveStateFromToken(token: string) {
  const payload = decodeJwtPayload(token);
  const digigoEmail = s(payload?.sub);
  if (!digigoEmail) {
    return { ok: false as const, error: "TOKEN_SUB_MISSING" };
  }

  const service = createServiceClient();

  const { data: sig, error } = await service
    .from("invoice_signatures")
    .select("invoice_id, company_id, meta, state, signed_at")
    .eq("provider", "digigo")
    .in("state", ["pending", "pending_auth", "token_exchange"])
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !sig) {
    return { ok: false as const, error: "PENDING_SIGNATURE_NOT_FOUND" };
  }

  return {
    ok: true as const,
    invoice_id: s(sig.invoice_id),
    company_id: s(sig.company_id),
    state: s((sig as any)?.meta?.state),
  };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const token = s(body.token);
  const code = s(body.code);
  let state = s(body.state);
  const invoice_id_from_body = s(body.invoice_id);

  if (!token && !code) {
    return NextResponse.json({ ok: false, error: "MISSING_FIELDS" }, { status: 400 });
  }

  const oauthToken = code || token;

  let invoice_id = "";
  let company_id = "";

  if (state) {
    invoice_id = s(state.split(".")[0]);
  }
  if (!invoice_id && invoice_id_from_body) {
    invoice_id = invoice_id_from_body;
  }

  if (!state && token) {
    const resolved = await resolveStateFromToken(token);
    if (!resolved.ok) {
      return NextResponse.json({ ok: false, error: resolved.error }, { status: 400 });
    }
    invoice_id = resolved.invoice_id;
    company_id = resolved.company_id;
    if (resolved.state) state = resolved.state;
  }

  if (!invoice_id) {
    return NextResponse.json({ ok: false, error: "STATE_INVALID" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: sig, error: sigErr } = await service
    .from("invoice_signatures")
    .select("invoice_id, company_id, unsigned_hash, meta, state")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  if (sigErr || !sig) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_CONTEXT_NOT_FOUND" }, { status: 404 });
  }

  const meta = (sig as any).meta ?? {};
  const metaState = s(meta.state);

  await service
    .from("invoice_signatures")
    .update({
      state: "token_exchange",
      meta: {
        ...meta,
        callback_received_at: new Date().toISOString(),
        state: state || metaState,
      },
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
          token_error: s(e?.message),
          token_data: e?.data ?? null,
        },
      })
      .eq("invoice_id", invoice_id);

    return NextResponse.json({ ok: false, error: "TOKEN_ERROR" }, { status: 502 });
  }

  const sad = s(sadResp?.sad);
  if (!sad) {
    return NextResponse.json({ ok: false, error: "SAD_MISSING" }, { status: 502 });
  }

  const credentialId = s(meta.credentialId);
  const unsigned_hash = s(sig.unsigned_hash);

  if (!credentialId || !unsigned_hash) {
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
    return NextResponse.json({ ok: false, error: "SIGN_ERROR" }, { status: 502 });
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
      meta: { ...meta, digigo_sign: signResp, sad },
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
