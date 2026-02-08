import { NextResponse } from "next/server";
import crypto from "crypto";
import https from "https";
import { URL } from "url";
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

function expiryMs(v: any) {
  const raw = s(v);
  if (!raw) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T23:59:59.999Z`).getTime();
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : NaN;
}

function b64urlToBuf(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function decodeJwtNoVerify(jwt: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_JWT");
  const payload = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = b64urlToBuf(parts[2]);
  return { payload, signingInput, signature };
}

function verifyJwtRS256(jwt: string, certPem: string) {
  const { payload, signingInput, signature } = decodeJwtNoVerify(jwt);
  const ok = crypto.verify("RSA-SHA256", Buffer.from(signingInput), certPem, signature);
  if (!ok) throw new Error("JWT_VERIFY_FAILED");
  return payload as any;
}

async function httpsPostJson(urlStr: string, body: any, allowInsecure: boolean) {
  const url = new URL(urlStr);
  const payload = Buffer.from(JSON.stringify(body ?? {}), "utf8");

  const options: https.RequestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port ? Number(url.port) : 443,
    path: url.pathname + (url.search || ""),
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": payload.length,
    },
    rejectUnauthorized: !allowInsecure,
  };

  return await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const svc = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const token = s(body?.token || "");
    const state = s(body?.state || "");
    const invoiceIdFromBody = s(body?.invoice_id || body?.invoiceId || "");

    if (!token && !state && !invoiceIdFromBody) {
      return NextResponse.json({ ok: false, error: "MISSING_PARAMS" }, { status: 400 });
    }

    let invoice_id = "";
    let back_url = "";

    if (state) {
      const sessRes = await svc.from("digigo_sign_sessions").select("*").eq("state", state).maybeSingle();
      const session: any = sessRes.data;

      if (!session) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });

      const exp = expiryMs(session.expires_at);
      if (Number.isFinite(exp) && exp < Date.now()) {
        await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
        return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 410 });
      }

      invoice_id = s(session.invoice_id);
      back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");

      if (s(session.status) === "done") {
        return NextResponse.json({ ok: true, invoice_id, redirect: back_url }, { status: 200 });
      }
    } else {
      if (!invoiceIdFromBody || !isUuid(invoiceIdFromBody)) {
        return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
      }
      invoice_id = invoiceIdFromBody;
      back_url = `/invoices/${invoice_id}`;
    }

    const invRes = await svc.from("invoices").select("*").eq("id", invoice_id).single();
    if (invRes.error || !invRes.data) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    const invoice: any = invRes.data;

    const unsigned_xml = s(invoice.unsigned_xml);
    if (!unsigned_xml) return NextResponse.json({ ok: false, error: "UNSIGNED_XML_MISSING" }, { status: 400 });

    const unsigned_hash = s(invoice.unsigned_hash || sha256Base64Utf8(unsigned_xml));
    if (!unsigned_hash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

    const allowInsecure = digigoAllowInsecure();

    const verify = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
    const jti = s(verify?.jti || "");
    if (!jti) return NextResponse.json({ ok: false, error: "JWT_MISSING_JTI" }, { status: 400 });

    const exchangeUrl = `${digigoBaseUrl()}/api/oauth/token`;
    const exchangeBody = {
      grant_type: digigoGrantType(),
      client_id: digigoClientId(),
      client_secret: digigoClientSecret(),
      redirect_uri: digigoRedirectUri(),
      token,
    };

    const exch = await httpsPostJson(exchangeUrl, exchangeBody, allowInsecure);
    let exchJson: any = {};
    try {
      exchJson = JSON.parse(exch.body || "{}");
    } catch {
      exchJson = { ok: false, error: "TOKEN_EXCHANGE_NON_JSON", body: exch.body, status: exch.status };
    }

    if (exch.status < 200 || exch.status >= 300) {
      return NextResponse.json(
        { ok: false, error: "TOKEN_EXCHANGE_FAILED", details: exchJson, status: exch.status },
        { status: 400 }
      );
    }

    const sad = s(exchJson?.sad || exchJson?.SAD || "");
    if (!sad) return NextResponse.json({ ok: false, error: "SAD_MISSING", details: exchJson }, { status: 400 });

    const signUrl = `${digigoBaseUrl()}/api/signature/sign`;
    const signBody = {
      sad,
      document_hash: unsigned_hash,
    };

    const signRes = await httpsPostJson(signUrl, signBody, allowInsecure);
    let signJson: any = {};
    try {
      signJson = JSON.parse(signRes.body || "{}");
    } catch {
      signJson = { ok: false, error: "SIGN_NON_JSON", body: signRes.body, status: signRes.status };
    }

    if (signRes.status < 200 || signRes.status >= 300) {
      return NextResponse.json({ ok: false, error: "SIGN_FAILED", details: signJson, status: signRes.status }, { status: 400 });
    }

    const signature_b64 = s(signJson?.signature || signJson?.signature_b64 || "");
    if (!signature_b64) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_MISSING", details: signJson }, { status: 400 });
    }

    const signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signature_b64);

    const meta = invoice.signature_meta || {};
    await svc
      .from("invoices")
      .update({
        signed_xml,
        signed_hash: sha256Base64Utf8(signed_xml),
        signed_at: new Date().toISOString(),
        meta: { ...meta, digigo_code: jti, sad_obtained: true },
      })
      .eq("invoice_id", invoice_id);

    await svc.from("invoices").update({ signature_status: "signed" }).eq("id", invoice_id);

    if (state) await svc.from("digigo_sign_sessions").update({ status: "done" }).eq("state", state);

    return NextResponse.json({ ok: true, invoice_id, redirect: back_url }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "SERVER_CRASH", message: "Erreur serveur (callback).", details: s(e?.message || e) },
      { status: 500 }
    );
  }
}
