import { NextResponse } from "next/server";
import crypto from "crypto";
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  digigoBaseUrl,
  digigoClientId,
  digigoClientSecret,
  digigoGrantType,
  digigoAllowInsecure,
  digigoRedirectUri,
  ttnProxyUrl,
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

function buildAgent() {
  const proxy = s(ttnProxyUrl());
  if (proxy) return new HttpsProxyAgent(proxy);
  if (digigoAllowInsecure()) return new https.Agent({ rejectUnauthorized: false });
  return undefined;
}

async function postJson(url: string, body: any) {
  const agent = buildAgent();
  const u = new URL(url);

  return await new Promise<{ ok: boolean; status: number; text: string; json: any }>((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body ?? {}), "utf8");

    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port ? Number(u.port) : 443,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(data.length),
        },
        agent: agent as any,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: any = {};
          try {
            json = JSON.parse(text);
          } catch {
            json = {};
          }
          resolve({ ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, status: res.statusCode || 0, text, json });
        });
      }
    );

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED", message: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const token = s(body.token);
    const codeFromBody = s(body.code);
    const stateIn = s(body.state);
    const invoiceIdIn = s(body.invoice_id);
    const backUrlIn = s(body.back_url);

    if (!token && !codeFromBody) {
      return NextResponse.json({ ok: false, error: "BAD_RETURN", message: "Retour DigiGo invalide." }, { status: 400 });
    }

    const svc = createServiceClient();

    let state = stateIn;
    let invoice_id = "";
    let back_url = "";

    if (state) {
      const sessRes = await svc.from("digigo_sign_sessions").select("*").eq("state", state).maybeSingle();
      if (!sessRes.data) {
        return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND", message: "Session introuvable." }, { status: 400 });
      }

      const session: any = sessRes.data;
      const exp = new Date(session.expires_at).getTime();
      const now = Date.now();

      if (!exp || exp + 30_000 < now) {
        await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
        return NextResponse.json({ ok: false, error: "SESSION_EXPIRED", message: "Session expirée. Relance la signature depuis la facture." }, { status: 410 });
      }

      invoice_id = s(session.invoice_id);
      back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");
    } else {
      if (!invoiceIdIn || !isUuid(invoiceIdIn)) {
        return NextResponse.json({ ok: false, error: "MISSING_CONTEXT", message: "Contexte manquant (state/invoice_id)." }, { status: 400 });
      }

      const sessRes = await svc
        .from("digigo_sign_sessions")
        .select("*")
        .eq("invoice_id", invoiceIdIn)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sessRes.data) {
        return NextResponse.json({ ok: false, error: "SESSION_EXPIRED", message: "Session expirée. Relance la signature depuis la facture." }, { status: 410 });
      }

      const session: any = sessRes.data;
      const exp = new Date(session.expires_at).getTime();
      const now = Date.now();

      if (!exp || exp + 30_000 < now) {
        await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
        return NextResponse.json({ ok: false, error: "SESSION_EXPIRED", message: "Session expirée. Relance la signature depuis la facture." }, { status: 410 });
      }

      state = s(session.state);
      invoice_id = s(session.invoice_id);
      back_url = s(session.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "/");
    }

    if (!back_url) back_url = backUrlIn || (invoice_id ? `/invoices/${invoice_id}` : "/");

    const { data: sigRow } = await svc.from("invoice_signatures").select("*").eq("invoice_id", invoice_id).maybeSingle();
    if (!sigRow) {
      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "SIGN_CTX_NOT_FOUND", message: "Contexte signature introuvable." }, { status: 400 });
    }

    const meta = (sigRow as any)?.meta && typeof (sigRow as any).meta === "object" ? (sigRow as any).meta : {};
    const expectedState = s(meta?.state || "");

    if (state && expectedState && state !== expectedState) {
      await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "STATE_MISMATCH", message: "State invalide." }, { status: 400 });
    }

    let digigoCode = s(codeFromBody);

    if (!digigoCode && token) {
      let payload: any;
      try {
        payload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
      } catch {
        if (digigoAllowInsecure()) {
          try {
            payload = decodeJwtNoVerify(token).payload;
          } catch {
            if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
            return NextResponse.json({ ok: false, error: "JWT_INVALID", message: "Token JWT invalide." }, { status: 400 });
          }
        } else {
          if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
          return NextResponse.json({ ok: false, error: "JWT_INVALID", message: "Token JWT invalide." }, { status: 400 });
        }
      }

      const jti = s(payload?.jti || "");
      if (!jti) {
        if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
        return NextResponse.json({ ok: false, error: "JWT_NO_JTI", message: "JWT sans jti." }, { status: 400 });
      }
      digigoCode = jti;
    }

    if (!digigoCode) {
      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "MISSING_CODE", message: "Code DigiGo manquant." }, { status: 400 });
    }

    const base = digigoBaseUrl().replace(/\/$/, "");
    const clientId = digigoClientId();
    const clientSecret = digigoClientSecret();
    const grantType = digigoGrantType();
    const redirectUri = digigoRedirectUri();

    if (!base || !clientId || !clientSecret || !grantType || !redirectUri) {
      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "DIGIGO_ENV_MISSING", message: "Variables DigiGo manquantes." }, { status: 500 });
    }

    const tokenUrl = `${base}/oauth2/token/${encodeURIComponent(clientId)}/${encodeURIComponent(grantType)}/${encodeURIComponent(
      clientSecret
    )}/${encodeURIComponent(digigoCode)}`;

    const tok = await postJson(tokenUrl, { redirectUri });

    if (!tok.ok) {
      await svc
        .from("invoice_signatures")
        .update({ state: "failed", meta: { ...meta, token_http: tok.status, token_body: tok.text } })
        .eq("invoice_id", invoice_id);

      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);

      return NextResponse.json({ ok: false, error: "TOKEN_EXCHANGE_FAILED", message: "Échange token échoué.", details: tok.text }, { status: 400 });
    }

    const sad = s(tok.json?.sad || tok.json?.SAD || "");
    if (!sad) {
      await svc.from("invoice_signatures").update({ state: "failed", meta: { ...meta, token_body: tok.text } }).eq("invoice_id", invoice_id);
      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "SAD_MISSING", message: "SAD manquant.", details: tok.text }, { status: 400 });
    }

    const unsigned_xml = s((sigRow as any)?.unsigned_xml || "");
    if (!unsigned_xml) {
      await svc.from("invoice_signatures").update({ state: "failed", error_message: "XML_MISSING" }).eq("invoice_id", invoice_id);
      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "XML_MISSING", message: "XML source manquant." }, { status: 400 });
    }

    const hashBase64 = sha256Base64Utf8(unsigned_xml);

    const signUrlPrimary = `${base}/signatures/signHash`;
    const signUrlFallback = `${base}/signature/signHash`;

    let sign = await postJson(signUrlPrimary, { sad, hash: hashBase64, hashAlgo: "SHA256", signAlgo: "RS256" });

    if (!sign.ok) {
      sign = await postJson(signUrlFallback, { sad, hash: hashBase64, hashAlgo: "SHA256", signAlgo: "RS256" });
    }

    if (!sign.ok) {
      await svc
        .from("invoice_signatures")
        .update({ state: "failed", meta: { ...meta, sign_http: sign.status, sign_body: sign.text } })
        .eq("invoice_id", invoice_id);

      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);

      return NextResponse.json({ ok: false, error: "SIGNHASH_FAILED", message: "Signature hash échouée.", details: sign.text }, { status: 400 });
    }

    const signatureValue = s(sign.json?.signature || sign.json?.signatureValue || sign.json?.value || "");
    if (!signatureValue) {
      await svc.from("invoice_signatures").update({ state: "failed", meta: { ...meta, sign_body: sign.text } }).eq("invoice_id", invoice_id);
      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "SIGNATURE_MISSING", message: "Signature manquante.", details: sign.text }, { status: 400 });
    }

    let signed_xml = "";
    try {
      signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signatureValue);
    } catch (e: any) {
      await svc
        .from("invoice_signatures")
        .update({ state: "failed", meta: { ...meta, inject_error: s(e?.message || e) } })
        .eq("invoice_id", invoice_id);
      if (state) await svc.from("digigo_sign_sessions").update({ status: "failed" }).eq("state", state);
      return NextResponse.json({ ok: false, error: "XML_INJECT_FAILED", message: "Injection signature échouée." }, { status: 400 });
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
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "CALLBACK_FATAL", message: "Erreur serveur.", details: s(e?.message || e) },
      { status: 500 }
    );
  }
}
