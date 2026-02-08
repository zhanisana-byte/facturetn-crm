import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  digigoAllowInsecure,
  digigoClientId,
  digigoClientSecret,
  digigoGrantType,
  digigoProxyBaseUrl,
  digigoRedirectUri,
} from "@/lib/digigo/env";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";
import { injectSignatureIntoTeifXml } from "@/lib/ttn/teifSignature";
import { sha256Base64Utf8 } from "@/lib/digigo/client";

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
  return JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
}

function verifyJwtRS256(jwt: string, certPem: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_JWT");
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = b64urlToBuf(parts[2]);
  const ok = crypto.verify("RSA-SHA256", Buffer.from(signingInput), certPem, signature);
  if (!ok) throw new Error("JWT_VERIFY_FAILED");
  return JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
}

async function postJson(url: string, body?: any) {
  if (digigoAllowInsecure()) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const t = await r.text();
  let j: any = {};
  try {
    j = JSON.parse(t);
  } catch {}
  return { r, t, j };
}

async function resolveSessionByState(service: any, state: string) {
  const st = s(state);
  if (!st || !isUuid(st)) throw new Error("MISSING_STATE");
  const sessRes = await service.from("digigo_sign_sessions").select("*").eq("state", st).maybeSingle();
  if (!sessRes.data) throw new Error("SESSION_NOT_FOUND");
  const session: any = sessRes.data;

  const exp = new Date(session.expires_at).getTime();
  if (!exp || exp + 30_000 < Date.now()) {
    await service.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
    throw new Error("SESSION_EXPIRED");
  }

  return session;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const service = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const token = s(body.token);
    const code = s(body.code);
    const state = s(body.state);

    if (!token && !code) {
      return NextResponse.json({ ok: false, error: "BAD_RETURN", message: "Retour DigiGo invalide." }, { status: 400 });
    }

    const session = await resolveSessionByState(service, state);
    const invoice_id = s(session.invoice_id);
    const back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");

    const sigRes = await service.from("invoice_signatures").select("*").eq("invoice_id", invoice_id).maybeSingle();
    if (!sigRes.data) {
      await service.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "SIGN_CTX_NOT_FOUND" }, { status: 400 });
    }

    const sig = sigRes.data as any;
    const credentialId = s(sig.meta?.credentialId);
    if (!credentialId) {
      await service.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "MISSING_CREDENTIAL" }, { status: 400 });
    }

    let digigoCode = s(code);

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
      await service.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "MISSING_CODE" }, { status: 400 });
    }

    const base = digigoProxyBaseUrl();

    const tokenUrl =
      `${base}/oauth2/token/` +
      `${encodeURIComponent(digigoClientId())}/` +
      `${encodeURIComponent(digigoGrantType())}/` +
      `${encodeURIComponent(digigoClientSecret())}/` +
      `${encodeURIComponent(digigoCode)}`;

    const tok = await postJson(tokenUrl, { redirectUri: digigoRedirectUri() });
    if (!tok.r.ok) {
      await service.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json(
        { ok: false, error: "TOKEN_EXCHANGE_FAILED", status: tok.r.status, body: tok.j || tok.t },
        { status: 400 }
      );
    }

    const sad = s(tok.j?.sad || tok.j?.SAD);
    if (!sad) {
      await service.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "MISSING_SAD", body: tok.j || tok.t }, { status: 400 });
    }

    const unsigned_xml = s(sig.unsigned_xml);
    if (!unsigned_xml) {
      await service.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "MISSING_UNSIGNED_XML" }, { status: 400 });
    }

    const hash = sha256Base64Utf8(unsigned_xml);

    const signUrl =
      `${base}/signatures/signHash/` +
      `${encodeURIComponent(digigoClientId())}/` +
      `${encodeURIComponent(credentialId)}/` +
      `${encodeURIComponent(sad)}/SHA256/RSA`;

    const sign = await postJson(signUrl, { hash });
    if (!sign.r.ok) {
      await service.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json(
        { ok: false, error: "SIGN_FAILED", status: sign.r.status, body: sign.j || sign.t },
        { status: 400 }
      );
    }

    const signatureValue = s(sign.j?.signature || sign.j?.value);
    if (!signatureValue) {
      await service.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "MISSING_SIGNATURE_VALUE", body: sign.j || sign.t }, { status: 400 });
    }

    const signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signatureValue);
    const signed_hash = sha256Base64Utf8(signed_xml);

    await service
      .from("invoice_signatures")
      .update({ state: "signed", signed_xml, signed_hash, signed_at: new Date().toISOString() })
      .eq("invoice_id", invoice_id);

    await service.from("invoices").update({ signature_status: "signed" }).eq("id", invoice_id);

    await service.from("digigo_sign_sessions").update({ status: "done" }).eq("state", state);

    return NextResponse.json({ ok: true, invoice_id, redirect: back_url }, { status: 200 });
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (msg === "SESSION_EXPIRED") {
      return NextResponse.json(
        { ok: false, error: "SESSION_EXPIRED", message: "Session expirée. Relance la signature depuis la facture." },
        { status: 410 }
      );
    }
    if (msg === "SESSION_NOT_FOUND") {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND", message: "Session introuvable." }, { status: 400 });
    }
    if (msg === "MISSING_STATE") {
      return NextResponse.json({ ok: false, error: "MISSING_STATE", message: "State manquant." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "CALLBACK_FATAL", message: "Erreur serveur.", details: msg }, { status: 500 });
  }
}
