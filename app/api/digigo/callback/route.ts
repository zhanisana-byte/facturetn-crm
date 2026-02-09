import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAllowInsecure } from "@/lib/digigo/env";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";

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
  const payload = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
  return payload;
}

function verifyJwtRS256(jwt: string, certPem: string) {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new Error("BAD_JWT");
  const data = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = b64urlToBuf(parts[2]);
  const ok = crypto.verify("RSA-SHA256", data, certPem, signature);
  if (!ok) throw new Error("JWT_VERIFY_FAILED");
  return JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
}

export async function POST(req: Request) {
  try {
    const svc = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const token = s(body.token);
    const stateIn = s(body.state);

    const c = await cookies();
    const stateCookie = s(c.get("digigo_state")?.value || "");
    const invoiceCookie = s(c.get("digigo_invoice_id")?.value || "");

    let state = stateIn || stateCookie;

    if (!state && token) {
      // On vérifie le JWT uniquement pour sécurité, mais on n’utilise PAS jti comme state.
      try {
        verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
      } catch {
        if (!digigoAllowInsecure()) throw new Error("JWT_INVALID");
        decodeJwtNoVerify(token);
      }
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

    const session: any = sessRes.data;

    await svc.from("digigo_sign_sessions").update({ status: "done", error_message: null }).eq("id", session.id);
    await svc.from("invoices").update({ signature_status: "signed", ttn_signed: true }).eq("id", session.invoice_id);

    const res = NextResponse.json(
      { ok: true, redirect: s(session.back_url) || `/invoices/${session.invoice_id}` },
      { status: 200 }
    );

    res.cookies.set("digigo_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
    res.cookies.set("digigo_back_url", "", { path: "/", maxAge: 0 });

    return res;
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "CALLBACK_FATAL", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
