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
  return {
    header,
    payload,
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: b64urlToBuf(parts[2]),
  };
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
  const t = await r.text();
  let j: any = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = { raw: t };
  }
  return { r, j, t };
}

async function postNoBody(url: string) {
  const r = await fetch(url, { method: "POST" });
  const t = await r.text();
  let j: any = {};
  try {
    j = t ? JSON.parse(t) : {};
  } catch {
    j = { raw: t };
  }
  return { r, j, t };
}

function env(name: string, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

// Mets ce paramètre dans Vercel (test/prod) OU récupère-le depuis ta config société
function digigoCredentialIdFallback() {
  return env("DIGIGO_CREDENTIAL_ID");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

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

  // 1) Résoudre invoice_id
  const svc = createServiceClient();

  let invoice_id = invoice_id_in;

  if (!invoice_id) {
    // Si invoice_id absent, on accepte un state (contexte interne)
    if (!state_in) {
      return NextResponse.json(
        {
          ok: false,
          error: "MISSING_CONTEXT",
          message: "Contexte manquant (invoice_id ou state requis).",
        },
        { status: 400 }
      );
    }

    // Cherche la ligne invoice_signatures via meta.state
    const { data: rows, error } = await svc
      .from("invoice_signatures")
      .select("invoice_id, meta, state")
      .contains("meta", { state: state_in })
      .limit(1);

    if (error || !rows?.length) {
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

  // state optionnel : on compare uniquement si les deux existent
  if (expectedState && state_in && expectedState !== state_in) {
    return NextResponse.json(
      { ok: false, error: "STATE_MISMATCH", message: "State invalide." },
      { status: 400 }
    );
  }

  // 3) Obtenir le "code" DigiGo (jti) depuis token JWT si nécessaire
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
          return NextResponse.json(
            { ok: false, error: "JWT_INVALID", message: "Token JWT invalide." },
            { status: 400 }
          );
        }
      } else {
        return NextResponse.json(
          { ok: false, error: "JWT_INVALID", message: "Token JWT invalide." },
          { status: 400 }
        );
      }
    }

    const jti = s(payload?.jti || "");
    if (!jti) {
      return NextResponse.json(
        { ok: false, error: "JWT_NO_JTI", message: "JWT sans jti." },
        { status: 400 }
      );
    }
    digigoCode = jti;
  }

  if (!digigoCode) {
    return NextResponse.json(
      { ok: false, error: "MISSING_CODE", message: "Code DigiGo manquant." },
      { status: 400 }
    );
  }

  // 4) oauth2/token : obtenir SAD
  const tokenUrl = `${base}/oauth2/token/${encodeURIComponent(clientId)}/${encodeURIComponent(
    grantType
  )}/${encodeURIComponent(clientSecret)}/${encodeURIComponent(digigoCode)}`;

  const { r: rTok, j: tokJson, t: tokText } = await postNoBody(tokenUrl);

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

  const sad = s(tokJson?.sad || tokJson?.SAD || tokJson?.access_token || "");
  if (!sad) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, token_body: tokText } })
      .eq("invoice_id", invoice_id);

    return NextResponse.json(
      { ok: false, error: "SAD_MISSING", message: "SAD manquant." },
      { status: 400 }
    );
  }

  // 5) Récupérer XML source
  const unsigned_xml = s((sigRow as any)?.unsigned_xml || "");
  if (!unsigned_xml) {
    return NextResponse.json(
      { ok: false, error: "XML_MISSING", message: "XML source manquant." },
      { status: 400 }
    );
  }

  // 6) Calcul hash de l’XML source (Base64)
  const hashBase64 = sha256Base64Utf8(unsigned_xml);

  // 7) Appel DigiGo signHash (format doc : URL params)
  // credentialId : idéalement stocké par société, sinon variable env
  const credentialId = s((meta as any)?.credential_id || digigoCredentialIdFallback());
  if (!credentialId) {
    return NextResponse.json(
      {
        ok: false,
        error: "CREDENTIAL_ID_MISSING",
        message: "credentialId DigiGo manquant (meta.credential_id ou env DIGIGO_CREDENTIAL_ID).",
      },
      { status: 400 }
    );
  }

  const hashAlgo = "SHA256";
  const signAlgo = "RS256";

  const signUrl = `${base}/signatures/signHash/${encodeURIComponent(clientId)}/${encodeURIComponent(
    credentialId
  )}/${encodeURIComponent(sad)}/${encodeURIComponent(hashAlgo)}/${encodeURIComponent(signAlgo)}`;

  // Certains environnements acceptent POST sans body, d’autres renvoient JSON.
  // Si ton DigiGo exige le hash dans le body, tu me le dis et je te donne la variante.
  const { r: rSign, j: jSign, t: signText } = await postJson(signUrl, { hash: hashBase64 });

  if (!rSign.ok) {
    await svc
      .from("invoice_signatures")
      .update({ state: "failed", meta: { ...meta, sign_http: rSign.status, sign_body: signText } })
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

  // 8) Injection de la signature dans TEIF XML
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

  // 9) Persister + statuts
  await svc
    .from("invoice_signatures")
    .update({
      state: "signed",
      signed_xml,
      signed_hash,
      meta: {
        ...meta,
        digigo_code: digigoCode,
        sad_obtained: true,
        credential_id: credentialId,
      },
    })
    .eq("invoice_id", invoice_id);

  await svc.from("invoices").update({ signature_status: "signed" }).eq("id", invoice_id);

  return NextResponse.json({ ok: true, invoice_id }, { status: 200 });
}
