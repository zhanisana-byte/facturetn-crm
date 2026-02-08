import { NextResponse } from "next/server";
import crypto from "crypto";
import https from "https";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  digigoBaseUrl,
  digigoClientId,
  digigoClientSecret,
  digigoGrantType,
  digigoAllowInsecure,
  digigoRedirectUri,
} from "@/lib/digigo/env";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";
import { sha256Base64Utf8 } from "@/lib/digigo/client";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";

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

function httpsAgent() {
  if (!digigoAllowInsecure()) return undefined;
  return new https.Agent({ rejectUnauthorized: false });
}

async function postJson(url: string, body: any) {
  const agent = httpsAgent();

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
    ...(agent ? ({ agent } as any) : {}),
  });

  const t = await r.text();
  let j: any = {};
  try {
    j = JSON.parse(t);
  } catch {}
  return { r, t, j };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const token = s(body.token);
  const codeFromBody = s(body.code);
  const state = s(body.state);
  const invoiceIdFromBody = s(body.invoice_id);

  if (!token && !codeFromBody) {
    return NextResponse.json({ ok: false, error: "BAD_RETURN" }, { status: 400 });
  }

  const svc = createServiceClient();

  let invoice_id = "";
  let back_url = "";

  if (state) {
    const sessRes = await svc.from("digigo_sign_sessions").select("*").eq("state", state).maybeSingle();
    if (!sessRes.data) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });

    const session: any = sessRes.data;
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
      return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 410 });
    }

    invoice_id = s(session.invoice_id);
    back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");
  } else {
    if (!invoiceIdFromBody || !isUuid(invoiceIdFromBody)) {
      return NextResponse.json({ ok: false, error: "MISSING_CONTEXT" }, { status: 400 });
    }
    invoice_id = invoiceIdFromBody;
    back_url = invoice_id ? `/invoices/${invoice_id}` : "/";
  }

  const { data: sigRow } = await svc.from("invoice_signatures").select("*").eq("invoice_id", invoice_id).maybeSingle();
  if (!sigRow) {
    if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
    return NextResponse.json({ ok: false, error: "SIGN_CTX_NOT_FOUND" }, { status: 400 });
  }

  const meta = (sigRow as any)?.meta && typeof (sigRow as any).meta === "object" ? (sigRow as any).meta : {};
  const expectedState = s(meta?.state || "");
  const credentialId = s(meta?.credentialId || "");

  if (state && expectedState && state !== expectedState) {
    if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
    return NextResponse.json({ ok: false, error: "STATE_MISMATCH" }, { status: 400 });
  }

  if (!credentialId) {
    if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
    return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
  }

  let digigoCode = codeFromBody;

  if (!digigoCode && token) {
    let payload: any;
    try {
      payload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
    } catch {
      if (digigoAllowInsecure()) payload = decodeJwtNoVerify(token).payload;
      else return NextResponse.json({ ok: false, error: "JWT_INVALID" }, { status: 400 });
    }

    const jti = s(payload?.jti || "");
    if (!jti) return NextResponse.json({ ok: false, error: "JWT_NO_JTI" }, { status: 400 });
    digigoCode = jti;
  }

  if (!digigoCode) return NextResponse.json({ ok: false, error: "MISSING_CODE" }, { status: 400 });

  const base = digigoBaseUrl().replace(/\/$/, "");
  const clientId = digigoClientId();
  const clientSecret = digigoClientSecret();
  const grantType = digigoGrantType();
  const redirectUri = digigoRedirectUri();

  if (!base || !clientId || !clientSecret || !grantType || !redirectUri) {
    return NextResponse.json({ ok: false, error: "DIGIGO_ENV_MISSING" }, { status: 500 });
  }

  const tokenUrl =
    `${base}/tunsign-proxy-webapp/services/v1/oauth2/token/` +
    `${encodeURIComponent(clientId)}/` +
    `${encodeURIComponent(grantType)}/` +
    `${encodeURIComponent(clientSecret)}/` +
    `${encodeURIComponent(digigoCode)}`;

  const tok = await postJson(tokenUrl, { redirectUri });

  if (!tok.r.ok) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, token_http: tok.r.status, token_body: tok.t } })
      .eq("invoice_id", invoice_id);

    if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);

    return NextResponse.json({ ok: false, error: "TOKEN_EXCHANGE_FAILED", details: tok.t }, { status: 400 });
  }

  const sad = s(tok.j?.sad || tok.j?.SAD || "");
  if (!sad) return NextResponse.json({ ok: false, error: "SAD_MISSING", details: tok.t }, { status: 400 });

  const unsigned_xml = s((sigRow as any)?.unsigned_xml || "");
  if (!unsigned_xml) return NextResponse.json({ ok: false, error: "XML_MISSING" }, { status: 400 });

  const hashBase64 = sha256Base64Utf8(unsigned_xml);

  const hashAlgo = "SHA256";
  const signAlgo = "RS256";

  const signUrl =
    `${base}/tunsign-proxy-webapp/services/v1/signatures/signHash/` +
    `${encodeURIComponent(clientId)}/` +
    `${encodeURIComponent(credentialId)}/` +
    `${encodeURIComponent(sad)}/` +
    `${encodeURIComponent(hashAlgo)}/` +
    `${encodeURIComponent(signAlgo)}`;

  const sign = await postJson(signUrl, { hash: [hashBase64] });

  if (!sign.r.ok) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, sign_http: sign.r.status, sign_body: sign.t } })
      .eq("invoice_id", invoice_id);

    if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);

    return NextResponse.json({ ok: false, error: "SIGNHASH_FAILED", details: sign.t }, { status: 400 });
  }

  const value = sign.j?.value;
  const signatureValue = Array.isArray(value) ? s(value[0] || "") : s(sign.j?.signature || sign.j?.signatureValue || sign.j?.value || "");

  if (!signatureValue) return NextResponse.json({ ok: false, error: "SIGNATURE_MISSING", details: sign.t }, { status: 400 });

  let signed_xml = "";
  try {
    signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signatureValue);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "XML_INJECT_FAILED", details: s(e?.message || e) }, { status: 400 });
  }

  const signed_hash = sha256Base64Utf8(signed_xml);

  await svc
    .from("invoice_signatures")
    .update({
      state: "signed",
      signed_xml,
      signed_hash,
      signed_at: new Date().toISOString(),
      meta: { ...meta, digigo_code: digigoCode, sad_obtained: true },
    })
    .eq("invoice_id", invoice_id);

  await svc.from("invoices").update({ signature_status: "signed" }).eq("id", invoice_id);

  if (state) await svc.from("digigo_sign_sessions").update({ status: "done" }).eq("state", state);

  return NextResponse.json({ ok: true, invoice_id, redirect: back_url }, { status: 200 });
}
