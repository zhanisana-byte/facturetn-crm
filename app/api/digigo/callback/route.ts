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

async function postJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { r, j };
}

async function postText(url: string) {
  const r = await fetch(url, { method: "POST" });
  const t = await r.text();
  return { r, t };
}

async function getAuthUserOrNull(req: Request) {
  const supabase = await createClient();

  // 1) Cookie session
  {
    const { data } = await supabase.auth.getUser();
    if (data?.user) return data.user;
  }

  // 2) Bearer token (fallback pour retour DigiGo)
  const authHeader = req.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = m ? m[1].trim() : "";

  if (accessToken) {
    // supporte getUser(token) selon ton wrapper Supabase
    const { data } = await (supabase.auth as any).getUser(accessToken);
    if (data?.user) return data.user;
  }

  return null;
}

export async function POST(req: Request) {
  const user = await getAuthUserOrNull(req);
  if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = s(body.token);
  const codeFromBody = s(body.code);
  const invoice_id_in = s(body.invoice_id);
  const state_in = s(body.state);

  if (!token && !codeFromBody) {
    return NextResponse.json(
      { ok: false, error: "BAD_RETURN", message: "Retour DigiGo invalide (token/code manquant)." },
      { status: 400 }
    );
  }

  const svc = createServiceClient();

  // 1) Résoudre invoice_id :
  // - soit fourni par le client
  // - soit trouvé via state dans meta
  let invoice_id = invoice_id_in;

  if (!invoice_id) {
    if (!state_in) {
      return NextResponse.json(
        { ok: false, error: "MISSING_CONTEXT", message: "Contexte manquant (invoice_id ou state requis)." },
        { status: 400 }
      );
    }

    const { data: rows } = await svc
      .from("invoice_signatures")
      .select("invoice_id, meta")
      .contains("meta", { state: state_in })
      .limit(1);

    if (!rows?.length) {
      return NextResponse.json(
        { ok: false, error: "SIGN_CTX_NOT_FOUND", message: "Contexte signature introuvable (state)." },
        { status: 400 }
      );
    }

    invoice_id = s((rows[0] as any)?.invoice_id);
  }

  if (!invoice_id) {
    return NextResponse.json(
      { ok: false, error: "MISSING_INVOICE_ID", message: "invoice_id introuvable." },
      { status: 400 }
    );
  }

  // 2) Charger le contexte signature
  const { data: sigRow } = await svc.from("invoice_signatures").select("*").eq("invoice_id", invoice_id).maybeSingle();
  if (!sigRow) {
    return NextResponse.json(
      { ok: false, error: "SIGN_CTX_NOT_FOUND", message: "Contexte signature introuvable." },
      { status: 400 }
    );
  }

  const meta = (sigRow as any)?.meta && typeof (sigRow as any).meta === "object" ? (sigRow as any).meta : {};
  const expectedState = s(meta?.state || "");

  if (expectedState && state_in && expectedState !== state_in) {
    return NextResponse.json({ ok: false, error: "STATE_MISMATCH", message: "State invalide." }, { status: 400 });
  }

  // 3) Déterminer digigoCode (jti)
  let digigoCode = codeFromBody;

  if (!digigoCode && token) {
    let payload: any;

    try {
      payload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
    } catch {
      if (digigoAllowInsecure()) {
        try {
          payload = decodeJwtNoVerify(token).payload;
        } catch {
          return NextResponse.json({ ok: false, error: "JWT_INVALID", message: "Token JWT invalide." }, { status: 400 });
        }
      } else {
        return NextResponse.json({ ok: false, error: "JWT_INVALID", message: "Token JWT invalide." }, { status: 400 });
      }
    }

    const jti = s(payload?.jti || "");
    if (!jti) {
      return NextResponse.json({ ok: false, error: "JWT_NO_JTI", message: "JWT sans jti." }, { status: 400 });
    }
    digigoCode = jti;
  }

  if (!digigoCode) {
    return NextResponse.json({ ok: false, error: "MISSING_CODE", message: "Code DigiGo manquant." }, { status: 400 });
  }

  // 4) oauth2/token => SAD
  const base = digigoBaseUrl();
  const clientId = digigoClientId();
  const clientSecret = digigoClientSecret();
  const grantType = digigoGrantType();

  if (!base || !clientId || !clientSecret || !grantType) {
    return NextResponse.json(
      { ok: false, error: "DIGIGO_ENV_MISSING", message: "Variables DigiGo manquantes." },
      { status: 500 }
    );
  }

  const tokenUrl = `${base}/oauth2/token/${encodeURIComponent(clientId)}/${encodeURIComponent(grantType)}/${encodeURIComponent(
    clientSecret
  )}/${encodeURIComponent(digigoCode)}`;

  const { r: rTok, t: tokText } = await postText(tokenUrl);

  if (!rTok.ok) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, token_http: rTok.status, token_body: tokText } })
      .eq("invoice_id", invoice_id);

    return NextResponse.json(
      { ok: false, error: "TOKEN_EXCHANGE_FAILED", message: "Échange token échoué." },
      { status: 400 }
    );
  }

  let tokJson: any = {};
  try {
    tokJson = JSON.parse(tokText);
  } catch {
    tokJson = {};
  }

  const sad = s(tokJson?.sad || tokJson?.SAD || tokJson?.access_token || "");
  if (!sad) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, token_body: tokText } })
      .eq("invoice_id", invoice_id);

    return NextResponse.json({ ok: false, error: "SAD_MISSING", message: "SAD manquant." }, { status: 400 });
  }

  // 5) XML source
  const unsigned_xml = s((sigRow as any)?.unsigned_xml || "");
  if (!unsigned_xml) {
    return NextResponse.json({ ok: false, error: "XML_MISSING", message: "XML source manquant." }, { status: 400 });
  }

  // 6) signHash
  const hashBase64 = sha256Base64Utf8(unsigned_xml);
  const signUrl = `${base}/signature/signHash`;

  const { r: rSign, j: jSign } = await postJson(signUrl, {
    sad,
    hash: hashBase64,
    hashAlgo: "SHA256",
    signAlgo: "RS256",
  });

  if (!rSign.ok || !jSign) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, sign_http: rSign.status, sign_body: jSign } })
      .eq("invoice_id", invoice_id);

    return NextResponse.json(
      { ok: false, error: "SIGNHASH_FAILED", message: "Signature hash échouée." },
      { status: 400 }
    );
  }

  const signatureValue = s(jSign?.signature || jSign?.signatureValue || jSign?.value || "");
  if (!signatureValue) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, sign_body: jSign } })
      .eq("invoice_id", invoice_id);

    return NextResponse.json(
      { ok: false, error: "SIGNATURE_MISSING", message: "Signature manquante." },
      { status: 400 }
    );
  }

  // 7) Injection signature
  let signed_xml = "";
  try {
    signed_xml = injectSignatureIntoTeifXml(unsigned_xml, signatureValue);
  } catch (e: any) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, inject_error: s(e?.message || e) } })
      .eq("invoice_id", invoice_id);

    return NextResponse.json(
      { ok: false, error: "XML_INJECT_FAILED", message: "Injection signature échouée." },
      { status: 400 }
    );
  }

  const signed_hash = sha256Base64Utf8(signed_xml);

  // 8) Persister
  await svc
    .from("invoice_signatures")
    .update({
      state: "signed",
      signed_xml,
      signed_hash,
      meta: { ...meta, digigo_code: digigoCode, sad_obtained: true },
    })
    .eq("invoice_id", invoice_id);

  await svc.from("invoices").update({ signature_status: "signed" }).eq("id", invoice_id);

  return NextResponse.json({ ok: true, invoice_id }, { status: 200 });
}
