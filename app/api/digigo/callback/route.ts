import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  digigoBaseUrl,
  digigoClientId,
  digigoClientSecret,
  digigoGrantType,
  digigoAllowInsecure,
  digigoRedirectUri,
  NDCA_JWT_VERIFY_CERT_PEM,
  sha256Base64Utf8,
} from "@/lib/digigo/client";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function b64urlToBuf(b64url: string) {
  const b64 =
    b64url.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function decodeJwtNoVerify(jwt: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_JWT");
  const payload = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
  return payload;
}

function verifyJwtRS256(jwt: string, certPem: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_JWT");
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = b64urlToBuf(parts[2]);
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(signingInput),
    certPem,
    signature
  );
  if (!ok) throw new Error("JWT_VERIFY_FAILED");
  return JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
}

async function postJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
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

  if (!token && !codeFromBody) {
    return NextResponse.json({ ok: false, error: "BAD_RETURN" }, { status: 400 });
  }
  if (!state) {
    return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
  }

  const svc = createServiceClient();

  const sessRes = await svc
    .from("digigo_sign_sessions")
    .select("*")
    .eq("state", state)
    .maybeSingle();

  if (!sessRes.data) {
    return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });
  }

  const session: any = sessRes.data;

  if (new Date(session.expires_at).getTime() < Date.now()) {
    await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
    return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 410 });
  }

  const invoice_id = s(session.invoice_id);
  const back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");

  const { data: sigRow } = await svc
    .from("invoice_signatures")
    .select("*")
    .eq("invoice_id", invoice_id)
    .maybeSingle();

  if (!sigRow) {
    return NextResponse.json({ ok: false, error: "SIGN_CTX_NOT_FOUND" }, { status: 400 });
  }

  let digigoCode = codeFromBody;

  if (!digigoCode && token) {
    let payload: any;
    try {
      payload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
    } catch {
      if (digigoAllowInsecure()) {
        payload = decodeJwtNoVerify(token);
      } else {
        return NextResponse.json({ ok: false, error: "JWT_INVALID" }, { status: 400 });
      }
    }
    digigoCode = s(payload?.jti);
    if (!digigoCode) {
      return NextResponse.json({ ok: false, error: "JWT_NO_JTI" }, { status: 400 });
    }
  }

  const base = digigoBaseUrl().replace(/\/$/, "");
  const tokenUrl = `${base}/tunsign-proxy-webapp/services/v1/oauth2/token/${encodeURIComponent(
    digigoClientId()
  )}/${encodeURIComponent(digigoGrantType())}/${encodeURIComponent(
    digigoClientSecret()
  )}/${encodeURIComponent(digigoCode)}`;

  const { r: rTok, j: tokJson } = await postJson(tokenUrl, {
    redirectUri: digigoRedirectUri(),
  });

  if (!rTok.ok) {
    await svc.from("invoice_signatures").update({ state: "failed" }).eq("invoice_id", invoice_id);
    await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("id", session.id);
    return NextResponse.json({ ok: false, error: "TOKEN_EXCHANGE_FAILED" }, { status: 400 });
  }

  const sad = s(tokJson?.sad || tokJson?.SAD);
  if (!sad) {
    return NextResponse.json({ ok: false, error: "SAD_MISSING" }, { status: 400 });
  }

  const unsigned_xml = s((sigRow as any)?.unsigned_xml);
  const hashBase64 = sha256Base64Utf8(unsigned_xml);

  const signUrl = `${base}/tunsign-proxy-webapp/services/v1/signatures/signHash`;

  const signResp = await postJson(signUrl, {
    sad,
    hash: hashBase64,
    hashAlgo: "SHA256",
    signAlgo: "RS256",
  });

  const signatureValue = s(
    signResp.j?.signature ||
      signResp.j?.signatureValue ||
      signResp.j?.value
  );

  if (!signatureValue) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_MISSING" }, { status: 400 });
  }

  const signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signatureValue);
  const signed_hash = sha256Base64Utf8(signed_xml);

  await svc
    .from("invoice_signatures")
    .update({
      state: "signed",
      signed_xml,
      signed_hash,
    })
    .eq("invoice_id", invoice_id);

  await svc.from("invoices").update({ signature_status: "signed" }).eq("id", invoice_id);
  await svc.from("digigo_sign_sessions").update({ status: "done" }).eq("id", session.id);

  return NextResponse.json(
    { ok: true, invoice_id, redirect: back_url },
    { status: 200 }
  );
}
