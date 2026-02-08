import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAllowInsecure } from "@/lib/digigo/env";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";
import {
  digigoProxyBaseUrl,
  digigoClientId,
  digigoClientSecret,
  digigoGrantType,
  digigoRedirectUri,
} from "@/lib/digigo/client";

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

async function resolveContextFromState(svc: any, state: string) {
  const st = s(state);
  if (!st) throw new Error("MISSING_STATE");

  const sessRes = await svc.from("digigo_sign_sessions").select("*").eq("state", st).maybeSingle();
  if (!sessRes.data) throw new Error("SESSION_NOT_FOUND");

  const session: any = sessRes.data;
  const exp = new Date(session.expires_at).getTime();
  const now = Date.now();

  if (!exp || exp + 30000 < now) {
    await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
    throw new Error("SESSION_EXPIRED");
  }

  const invoice_id = s(session.invoice_id);
  const back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");

  return { state: st, invoice_id, back_url, session_id: s(session.id) };
}

async function resolveContextFromInvoice(svc: any, invoiceId: string) {
  const inv = s(invoiceId);
  if (!inv || !isUuid(inv)) throw new Error("MISSING_CONTEXT");

  const sessRes = await svc
    .from("digigo_sign_sessions")
    .select("*")
    .eq("invoice_id", inv)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sessRes.data) throw new Error("SESSION_EXPIRED");

  const session: any = sessRes.data;
  const exp = new Date(session.expires_at).getTime();
  const now = Date.now();

  if (!exp || exp + 30000 < now) {
    await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
    throw new Error("SESSION_EXPIRED");
  }

  const state = s(session.state);
  const invoice_id = s(session.invoice_id);
  const back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");

  return { state, invoice_id, back_url, session_id: s(session.id) };
}

async function digigoGetSadFromCode(code: string) {
  const clientId = digigoClientId();
  const clientSecret = digigoClientSecret();
  const grantType = digigoGrantType();
  const redirectUri = digigoRedirectUri();

  if (!clientId || !clientSecret || !redirectUri) throw new Error("DIGIGO_CONFIG_MISSING");

  const url = `${digigoProxyBaseUrl()}/services/v1/oauth2/token/${encodeURIComponent(clientId)}/${encodeURIComponent(
    grantType || "authorization_code"
  )}/${encodeURIComponent(clientSecret)}/${encodeURIComponent(code)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirectUri }),
  });

  const txt = await r.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {}

  if (!r.ok) throw new Error(`DIGIGO_TOKEN_FAILED:${r.status}`);

  const sad = s(j?.sad || "");
  if (!sad) throw new Error("DIGIGO_SAD_MISSING");
  return { sad, raw: j };
}

async function digigoSignHash(credentialId: string, sad: string, hashB64: string) {
  const clientId = digigoClientId();
  if (!clientId) throw new Error("DIGIGO_CLIENT_ID_MISSING");

  const hashAlgo = s(process.env.DIGIGO_HASH_ALGO_OID || "2.16.840.1.101.3.4.2.1");
  const signAlgo = s(process.env.DIGIGO_SIGN_ALGO_OID || "1.2.840.113549.1.1.11");

  const url = `${digigoProxyBaseUrl()}/services/v1/signatures/signHash/${encodeURIComponent(clientId)}/${encodeURIComponent(
    credentialId
  )}/${encodeURIComponent(sad)}/${encodeURIComponent(hashAlgo)}/${encodeURIComponent(signAlgo)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hash: [hashB64] }),
  });

  const txt = await r.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {}

  if (!r.ok) throw new Error(`DIGIGO_SIGN_FAILED:${r.status}`);

  const signedHashB64 = s(Array.isArray(j?.value) ? j.value[0] : "");
  if (!signedHashB64) throw new Error("DIGIGO_SIGN_EMPTY");
  return { signedHashB64, raw: j };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const svc = createServiceClient();
  const body = await req.json().catch(() => ({}));

  const token = s(body.token);
  const codeIn = s(body.code);
  const stateIn = s(body.state);
  const invoiceIdIn = s(body.invoice_id);

  const c = await cookies();
  const stateCookie = s(c.get("digigo_state")?.value || "");
  const invoiceCookie = s(c.get("digigo_invoice_id")?.value || "");
  const backCookie = s(c.get("digigo_back_url")?.value || "");

  const stateTry = stateIn || stateCookie;
  const invoiceTry = invoiceIdIn || invoiceCookie;

  let ctx;
  if (stateTry) ctx = await resolveContextFromState(svc, stateTry);
  else if (invoiceTry) ctx = await resolveContextFromInvoice(svc, invoiceTry);
  else return NextResponse.json({ ok: false, error: "MISSING_CONTEXT" }, { status: 400 });

  const sigRes = await svc.from("invoice_signatures").select("*").eq("invoice_id", ctx.invoice_id).maybeSingle();
  if (!sigRes.data) return NextResponse.json({ ok: false, error: "SIGN_CTX_NOT_FOUND" }, { status: 400 });

  const sigRow: any = sigRes.data;
  const meta = sigRow.meta || {};
  const unsigned_hash = s(sigRow.unsigned_hash || "");
  const credentialId = s(meta.credentialId || "");
  if (!unsigned_hash || !credentialId)
    return NextResponse.json({ ok: false, error: "MISSING_SIGN_DATA" }, { status: 400 });

  let jwtPayload: any = null;
  let code = s(codeIn);

  if (token) {
    try {
      jwtPayload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
    } catch {
      if (digigoAllowInsecure()) jwtPayload = decodeJwtNoVerify(token).payload;
      else return NextResponse.json({ ok: false, error: "JWT_INVALID" }, { status: 400 });
    }
    code = s(jwtPayload?.jti || "");
    if (!code) return NextResponse.json({ ok: false, error: "MISSING_JTI" }, { status: 400 });
  }

  if (!code) return NextResponse.json({ ok: false, error: "MISSING_CODE" }, { status: 400 });

  try {
    const { sad } = await digigoGetSadFromCode(code);
    const { signedHashB64 } = await digigoSignHash(credentialId, sad, unsigned_hash);

    await svc
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_at: new Date().toISOString(),
        signed_hash: signedHashB64,
        session_id: ctx.session_id,
        meta: { ...meta, digigo_sad: sad },
      })
      .eq("invoice_id", ctx.invoice_id);

    await svc.from("digigo_sign_sessions").update({ status: "done" }).eq("id", ctx.session_id);
    await svc.from("invoices").update({ signature_status: "signed", ttn_signed: true }).eq("id", ctx.invoice_id);

    const res = NextResponse.json({ ok: true, invoice_id: ctx.invoice_id, redirect: backCookie || `/invoices/${ctx.invoice_id}` });
    res.cookies.set("digigo_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
    res.cookies.set("digigo_back_url", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e: any) {
    const details = String(e?.message || e || "");
    await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: details }).eq("id", ctx.session_id);
    await svc.from("invoice_signatures").update({ state: "failed", error_message: details }).eq("invoice_id", ctx.invoice_id);
    await svc.from("invoices").update({ signature_status: "failed" }).eq("id", ctx.invoice_id);
    return NextResponse.json({ ok: false, error: "DIGIGO_FLOW_FAILED", details }, { status: 400 });
  }
}
