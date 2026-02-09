import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
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

function b64urlToBuf(b64url: string) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  return Buffer.from(b64, "base64");
}

function decodeJwtNoVerify(jwt: string) {
  const [h, p, sig] = jwt.split(".");
  if (!sig) throw new Error("BAD_JWT");
  return {
    header: JSON.parse(b64urlToBuf(h).toString("utf8")),
    payload: JSON.parse(b64urlToBuf(p).toString("utf8")),
  };
}

function verifyJwtRS256(jwt: string, certPem: string) {
  const [h, p, sig] = jwt.split(".");
  const data = Buffer.from(`${h}.${p}`);
  const signature = b64urlToBuf(sig);
  const ok = crypto.verify("RSA-SHA256", data, certPem, signature);
  if (!ok) throw new Error("JWT_VERIFY_FAILED");
  return JSON.parse(b64urlToBuf(p).toString("utf8"));
}

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const token = s(body.token);
    const codeIn = s(body.code);

    if (!token && !codeIn) {
      return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
    }

    let jwtPayload: any = null;
    let state = "";

    if (token) {
      try {
        jwtPayload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
      } catch {
        if (!digigoAllowInsecure()) throw new Error("JWT_INVALID");
        jwtPayload = decodeJwtNoVerify(token).payload;
      }
      state = s(jwtPayload?.jti || "");
    }

    if (!state) {
      return NextResponse.json({ ok: false, error: "MISSING_CONTEXT" }, { status: 400 });
    }

    const sessRes = await svc
      .from("digigo_sign_sessions")
      .select("*")
      .eq("state", state)
      .eq("status", "pending")
      .maybeSingle();

    if (!sessRes.data) {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });
    }

    const session = sessRes.data;

    await svc
      .from("digigo_sign_sessions")
      .update({ status: "done", error_message: null })
      .eq("id", session.id);

    await svc
      .from("invoices")
      .update({ signature_status: "signed", ttn_signed: true })
      .eq("id", session.invoice_id);

    return NextResponse.json(
      { ok: true, redirect: session.back_url || `/invoices/${session.invoice_id}` },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "CALLBACK_FATAL", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
