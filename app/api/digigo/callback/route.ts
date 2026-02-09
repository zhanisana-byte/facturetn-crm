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
  return { header, payload };
}

function verifyJwtRS256(jwt: string, certPem: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_JWT");
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = b64urlToBuf(parts[2]);
  const ok = crypto.verify("RSA-SHA256", signingInput, certPem, signature);
  if (!ok) throw new Error("JWT_VERIFY_FAILED");
  const payload = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
  return payload as any;
}

async function digigoGetSadFromCode(code: string) {
  const clientId = digigoClientId();
  const clientSecret = digigoClientSecret();
  const grantType = digigoGrantType();
  const redirectUri = digigoRedirectUri();

  if (!clientId) throw new Error("DIGIGO_CLIENT_ID_MISSING");
  if (!clientSecret) throw new Error("DIGIGO_CLIENT_SECRET_MISSING");
  if (!redirectUri) throw new Error("DIGIGO_REDIRECT_URI_MISSING");

  const url =
    `${digigoProxyBaseUrl()}/services/v1/oauth2/token/` +
    `${encodeURIComponent(clientId)}/` +
    `${encodeURIComponent(grantType || "authorization_code")}/` +
    `${encodeURIComponent(clientSecret)}/` +
    `${encodeURIComponent(code)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirectUri }),
  });

  const txt = await r.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }

  if (!r.ok) throw new Error(`DIGIGO_TOKEN_FAILED:${r.status}:${txt || ""}`);

  const sad = s(j?.sad || "");
  if (!sad) throw new Error("DIGIGO_SAD_MISSING");

  return { sad };
}

async function digigoSignHash(credentialId: string, sad: string, hashB64: string) {
  const clientId = digigoClientId();
  if (!clientId) throw new Error("DIGIGO_CLIENT_ID_MISSING");

  const hashAlgo = s(process.env.DIGIGO_HASH_ALGO_OID || "2.16.840.1.101.3.4.2.1");
  const signAlgo = s(process.env.DIGIGO_SIGN_ALGO_OID || "1.2.840.113549.1.1.11");

  const url =
    `${digigoProxyBaseUrl()}/services/v1/signatures/signHash/` +
    `${encodeURIComponent(clientId)}/` +
    `${encodeURIComponent(credentialId)}/` +
    `${encodeURIComponent(sad)}/` +
    `${encodeURIComponent(hashAlgo)}/` +
    `${encodeURIComponent(signAlgo)}`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hash: [hashB64] }),
  });

  const txt = await r.text().catch(() => "");
  let j: any = null;
  try {
    j = txt ? JSON.parse(txt) : null;
  } catch {
    j = null;
  }

  if (!r.ok) throw new Error(`DIGIGO_SIGN_FAILED:${r.status}:${txt || ""}`);

  const arr = Array.isArray(j?.value) ? j.value : [];
  const signedHashB64 = s(arr?.[0] || "");
  if (!signedHashB64) throw new Error("DIGIGO_SIGN_EMPTY");

  return { signedHashB64 };
}

export async function POST(req: Request) {
  const svc = createServiceClient();

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    const token = s(body.token);
    const codeIn = s(body.code);
    const stateIn = s(body.state);
    const invoiceIdIn = s(body.invoice_id);
    const backUrlIn = s(body.back_url);

    const c = await cookies();
    const stateCookie = s(c.get("digigo_state")?.value || "");
    const invoiceCookie = s(c.get("digigo_invoice_id")?.value || "");
    const backCookie = s(c.get("digigo_back_url")?.value || "");

    const stateTry = stateIn || stateCookie;
    const invoiceTry = invoiceIdIn || invoiceCookie;

    if (!stateTry && !invoiceTry) {
      return NextResponse.json({ ok: false, error: "MISSING_CONTEXT" }, { status: 400 });
    }

    let session: any = null;

    if (stateTry) {
      const r = await svc
        .from("digigo_sign_sessions")
        .select("*")
        .eq("state", stateTry)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      session = r.data || null;
    }

    if (!session && invoiceTry && isUuid(invoiceTry)) {
      const r = await svc
        .from("digigo_sign_sessions")
        .select("*")
        .eq("invoice_id", invoiceTry)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      session = r.data || null;
    }

    if (!session) {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });
    }

    const exp = new Date(session.expires_at).getTime();
    if (!exp || exp < Date.now()) {
      await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
      return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
    }

    const sigRes = await svc.from("invoice_signatures").select("*").eq("invoice_id", session.invoice_id).maybeSingle();
    if (!sigRes.data) {
      await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: "SIGN_CTX_NOT_FOUND" }).eq("id", session.id);
      await svc.from("invoices").update({ signature_status: "failed" }).eq("id", session.invoice_id);
      return NextResponse.json({ ok: false, error: "SIGN_CTX_NOT_FOUND" }, { status: 400 });
    }

    const sigRow: any = sigRes.data;
    const meta = sigRow?.meta && typeof sigRow.meta === "object" ? sigRow.meta : {};
    const credentialId = s(meta?.credentialId || "");

    const unsigned_hash = s(sigRow?.unsigned_hash || "");
    const unsigned_xml = s(sigRow?.unsigned_xml || "");

    if (!credentialId || !unsigned_hash) {
      await svc.from("digigo_sign_sessions").update({ status: "failed", error_message: "MISSING_SIGN_DATA" }).eq("id", session.id);
      await svc.from("invoice_signatures").update({ state: "failed", error_message: "MISSING_SIGN_DATA" }).eq("invoice_id", session.invoice_id);
      await svc.from("invoices").update({ signature_status: "failed" }).eq("id", session.invoice_id);
      return NextResponse.json({ ok: false, error: "MISSING_SIGN_DATA" }, { status: 400 });
    }

    let jwtPayload: any = null;
    let code = s(codeIn);

    if (token) {
      try {
        jwtPayload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
      } catch {
        if (digigoAllowInsecure()) jwtPayload = decodeJwtNoVerify(token).payload;
        else return NextResponse.json({ ok: false, error: "JWT_INVALID" }, { status: 400 });
      }

      // IMPORTANT: on ne prend PAS jti comme state. On prend juste le code OAuth.
      code = s(jwtPayload?.jti || "");
    }

    if (!code) return NextResponse.json({ ok: false, error: "MISSING_CODE" }, { status: 400 });

    const { sad } = await digigoGetSadFromCode(code);
    const { signedHashB64 } = await digigoSignHash(credentialId, sad, unsigned_hash);

    await svc
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_at: new Date().toISOString(),
        signed_hash: signedHashB64,
        signed_xml: unsigned_xml || null,
        session_id: session.id,
        error_message: null,
        meta: {
          ...meta,
          digigo_token_present: !!token,
          digigo_token_jti: s(jwtPayload?.jti || ""),
          digigo_token_sub: s(jwtPayload?.sub || ""),
          digigo_token_exp: Number(jwtPayload?.exp || 0),
          digigo_sad: sad,
        },
      })
      .eq("invoice_id", session.invoice_id);

    await svc.from("digigo_sign_sessions").update({ status: "done", error_message: null }).eq("id", session.id);
    await svc.from("invoices").update({ signature_status: "signed", ttn_signed: true }).eq("id", session.invoice_id);

    const finalBackUrl =
      s(backUrlIn) || s(session.back_url) || backCookie || (session.invoice_id ? `/invoices/${session.invoice_id}` : "/");

    const res = NextResponse.json({ ok: true, invoice_id: session.invoice_id, redirect: finalBackUrl }, { status: 200 });

    res.cookies.set("digigo_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
    res.cookies.set("digigo_back_url", "", { path: "/", maxAge: 0 });

    return res;
  } catch (e: any) {
    const details = String(e?.message || e || "");
    return NextResponse.json({ ok: false, error: "CALLBACK_FATAL", details }, { status: 500 });
  }
}
