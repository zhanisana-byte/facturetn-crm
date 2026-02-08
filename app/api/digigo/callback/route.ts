import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  digigoBaseUrl,
  digigoClientId,
  digigoClientSecret,
  digigoGrantType,
  digigoRedirectUri,
  digigoAllowInsecure,
} from "@/lib/digigo/env";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function b64urlToBuf(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function decodeJwtNoVerify(jwt: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_JWT");
  return JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
}

function verifyJwtRS256(jwt: string, certPem: string) {
  const parts = jwt.split(".");
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = b64urlToBuf(parts[2]);
  const ok = crypto.verify("RSA-SHA256", Buffer.from(signingInput), certPem, signature);
  if (!ok) throw new Error("JWT_VERIFY_FAILED");
  return JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
}

async function postJson(url: string, body?: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
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
  const service = createServiceClient();

  const body = await req.json().catch(() => ({}));
  const token = s(body.token);
  const code = s(body.code);
  const state = s(body.state);

  if (!token && !code) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sessRes = await service
    .from("digigo_sign_sessions")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (!sessRes.data) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const session: any = sessRes.data;
  const invoice_id = s(session.invoice_id);
  const back_url = s(session.back_url);

  const sigRes = await service
    .from("invoice_signatures")
    .select("*")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  if (!sigRes.data) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sig = sigRes.data as any;
  const credentialId = s(sig.meta?.credentialId);

  let digigoCode = code;

  if (!digigoCode && token) {
    try {
      const payload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
      digigoCode = s(payload?.jti);
    } catch {
      if (digigoAllowInsecure()) {
        const payload = decodeJwtNoVerify(token);
        digigoCode = s(payload?.jti);
      }
    }
  }

  if (!digigoCode) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const tokenUrl =
    `${digigoBaseUrl()}/oauth2/token/` +
    `${encodeURIComponent(digigoClientId())}/` +
    `${encodeURIComponent(digigoGrantType())}/` +
    `${encodeURIComponent(digigoClientSecret())}/` +
    `${encodeURIComponent(digigoCode)}`;

  const tok = await postJson(tokenUrl, {
    redirectUri: digigoRedirectUri(),
  });

  if (!tok.r.ok) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sad = s(tok.j?.sad || tok.j?.SAD);
  if (!sad) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const unsigned_xml = s(sig.unsigned_xml);
  const hash = sha256Base64Utf8(unsigned_xml);

  const signUrl =
    `${digigoBaseUrl()}/signatures/signHash/` +
    `${encodeURIComponent(digigoClientId())}/` +
    `${encodeURIComponent(credentialId)}/` +
    `${encodeURIComponent(sad)}/SHA256/RSA`;

  const sign = await postJson(signUrl, { hash });

  if (!sign.r.ok) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const signatureValue = s(sign.j?.signature || sign.j?.value);
  if (!signatureValue) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signatureValue);
  const signed_hash = sha256Base64Utf8(signed_xml);

  await service.from("invoice_signatures").update({
    state: "signed",
    signed_xml,
    signed_hash,
    signed_at: new Date().toISOString(),
  }).eq("invoice_id", invoice_id);

  await service.from("invoices").update({
    signature_status: "signed",
  }).eq("id", invoice_id);

  await service.from("digigo_sign_sessions").update({
    status: "done",
  }).eq("state", state);

  return NextResponse.json({
    ok: true,
    invoice_id,
    redirect: back_url || `/invoices/${invoice_id}`,
  });
}
