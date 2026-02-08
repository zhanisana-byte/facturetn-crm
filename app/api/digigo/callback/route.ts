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

async function postJson(url: string, body: any) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const t = await r.text();
  let j: any = {};
  try {
    j = JSON.parse(t);
  } catch {
    j = {};
  }
  return { r, t, j };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED", message: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = s(body.token);
  const codeFromBody = s(body.code);
  const state = s(body.state);
  const invoiceIdFromBody = s(body.invoice_id);

  if (!token && !codeFromBody) {
    return NextResponse.json({ ok: false, error: "BAD_RETURN", message: "Retour DigiGo invalide." }, { status: 400 });
  }

  const svc = createServiceClient();

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
    if (exp && exp + 30_000 < now) {
      await svc.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", session.id);
      return NextResponse.json(
        { ok: false, error: "SESSION_EXPIRED", message: "Session ex_
