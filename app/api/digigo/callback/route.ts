import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";
import { digigoAllowInsecure } from "@/lib/digigo/env";

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
  return JSON.parse(b64urlToBuf(p).toString("utf8"));
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
    if (!token) {
      return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
    }

    let payload: any;
    try {
      payload = verifyJwtRS256(token, NDCA_JWT_VERIFY_CERT_PEM);
    } catch {
      if (!digigoAllowInsecure()) throw new Error("JWT_INVALID");
      payload = decodeJwtNoVerify(token);
    }

    const jti = s(payload?.jti);
    if (!jti) {
      return NextResponse.json({ ok: false, error: "MISSING_JTI" }, { status: 400 });
    }

    // 🔑 On récupère la DERNIÈRE session pending
    const sessRes = await svc
      .from("digigo_sign_sessions")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sessRes.data) {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });
    }

    const session = sessRes.data;

    // On marque la session comme terminée
    await svc
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    // On marque la facture comme signée
    await svc
      .from("invoices")
      .update({
        signature_status: "signed",
        ttn_signed: true,
      })
      .eq("id", session.invoice_id);

    return NextResponse.json({
      ok: true,
      redirect: session.back_url || `/invoices/${session.invoice_id}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "CALLBACK_FATAL", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
