import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAllowInsecure } from "@/lib/digigo/env";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function b64urlToBuf(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function decodeJwtNoVerify(jwt: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_JWT");
  const header = JSON.parse(b64urlToBuf(parts[0]).toString("utf8"));
  const payload = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
  return { header, payload, signingInput: `${parts[0]}.${parts[1]}`, signature: b64urlToBuf(parts[2]) };
}

function verifyJwtRS256(jwt: string, certPem: string) {
  const { payload, signingInput, signature } = decodeJwtNoVerify(jwt);
  const ok = crypto.verify("RSA-SHA256", Buffer.from(signingInput), certPem, signature);
  if (!ok) throw new Error("JWT_VERIFY_FAILED");
  return payload as any;
}

async function resolveByStateOrInvoice(svc: any, stateIn: string, invoiceIdIn: string) {
  const state = s(stateIn);
  const invoice_id_in = s(invoiceIdIn);

  if (state) {
    const sessRes = await svc.from("digigo_sign_sessions").select("*").eq("state", state).maybeSingle();
    if (!sessRes.data) throw new Error("SESSION_NOT_FOUND");
    const session: any = sessRes.data;

    const exp = new Date(session.expires_at).getTime();
    const now = Date.now();
    if (!exp || exp + 30_000 < now) {
      await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
      throw new Error("SESSION_EXPIRED");
    }

    const invoice_id = s(session.invoice_id);
    const back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");
    return { state: s(session.state), invoice_id, back_url, session_id: session.id };
  }

  if (!invoice_id_in || !isUuid(invoice_id_in)) throw new Error("MISSING_CONTEXT");

  const sessRes = await svc
    .from("digigo_sign_sessions")
    .select("*")
    .eq("invoice_id", invoice_id_in)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sessRes.data) throw new Error("SESSION_EXPIRED");

  const session: any = sessRes.data;
  const exp = new Date(session.expires_at).getTime();
  const now = Date.now();
  if (!exp || exp + 30_000 < now) {
    await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
    throw new Error("SESSION_EXPIRED");
  }

  const invoice_id = s(session.invoice_id);
  const back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");
  return { state: s(session.state), invoice_id, back_url, session_id: session.id };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const svc = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const token = s(body.token);
    const code = s(body.code);
    const stateIn = s(body.state);
    const invoiceIdIn = s(body.invoice_id);
    const backUrlIn = s(body.back_url);

    if (!token && !code) {
      return NextResponse.json({ ok: false, error: "BAD_RETURN", message: "Retour DigiGo invalide." }, { status: 400 });
    }

    const { state, invoice_id, back_url } = await resolveByStateOrInvoice(svc, stateIn, invoiceIdIn);
    const finalBackUrl = s(backUrlIn) || back_url || (invoice_id ? `/invoices/${invoice_id}` : "/");

    const sigRes = await svc.from("invoice_signatures").select("*").eq("invoice_id", invoice_id).maybeSingle();
    if (!sigRes.data) {
      await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "SIGN_CTX_NOT_FOUND" }, { status: 400 });
    }

    const sigRow: any = sigRes.data;
    const meta = sigRow?.meta && typeof sigRow.meta === "object" ? sigRow.meta : {};

    if (token) {
      let payload: any;
      try {
        payload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
      } catch {
        if (digigoAllowInsecure()) {
          payload = decodeJwtNoVerify(token).payload;
        } else {
          await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
          return NextResponse.json({ ok: false, error: "JWT_INVALID", message: "Token JWT invalide." }, { status: 400 });
        }
      }

      const subject = s(payload?.sub || "");
      const jti = s(payload?.jti || "");
      const exp = Number(payload?.exp || 0);

      const unsigned_xml = s(sigRow?.unsigned_xml || "");
      const unsigned_hash = s(sigRow?.unsigned_hash || "");

      await svc
        .from("invoice_signatures")
        .update({
          state: "signed",
          signed_at: new Date().toISOString(),
          meta: {
            ...meta,
            state,
            digigo_token_sub: subject,
            digigo_token_jti: jti,
            digigo_token_exp: exp,
            digigo_token_present: true,
          },
          signed_xml: sigRow?.signed_xml || unsigned_xml,
          signed_hash: sigRow?.signed_hash || unsigned_hash,
        })
        .eq("invoice_id", invoice_id);

      await svc.from("invoices").update({ signature_status: "signed" }).eq("id", invoice_id);
      await svc.from("digigo_sign_sessions").update({ status: "done" }).eq("state", state);

      return NextResponse.json({ ok: true, invoice_id, redirect: finalBackUrl }, { status: 200 });
    }

    await svc
      .from("invoice_signatures")
      .update({
        state: "failed",
        meta: { ...meta, state, code_received: true },
        error_message: "OAUTH_CODE_NOT_SUPPORTED_IN_PROXY",
      })
      .eq("invoice_id", invoice_id);

    await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);

    return NextResponse.json(
      { ok: false, error: "OAUTH_CODE_NOT_SUPPORTED", message: "Ce mode proxy attend token=JWT, pas code." },
      { status: 400 }
    );
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    const map: Record<string, { status: number; error: string; message: string }> = {
      SESSION_NOT_FOUND: { status: 400, error: "SESSION_NOT_FOUND", message: "Session introuvable." },
      SESSION_EXPIRED: { status: 410, error: "SESSION_EXPIRED", message: "Session expirée. Relance la signature depuis la facture." },
      MISSING_CONTEXT: { status: 400, error: "MISSING_CONTEXT", message: "Contexte manquant (state ou invoice_id)." },
      BAD_JWT: { status: 400, error: "BAD_JWT", message: "Token JWT invalide." },
    };
    const hit = map[msg];
    if (hit) return NextResponse.json({ ok: false, error: hit.error, message: hit.message }, { status: hit.status });
    return NextResponse.json({ ok: false, error: "CALLBACK_FATAL", message: "Erreur serveur.", details: msg }, { status: 500 });
  }
}
