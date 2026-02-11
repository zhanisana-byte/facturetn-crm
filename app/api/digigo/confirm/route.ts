import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoOauthToken, jwtGetJti } from "@/lib/digigo/server";
import { NDCA_JWT_VERIFY_CERT_PEM } from "@/lib/digigo/certs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}
function b64urlToBuf(b64url: string) {
  const pad = b64url.length % 4 === 0 ? "" : "=".repeat(4 - (b64url.length % 4));
  const b64 = (b64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}
function jwtVerifyRs256(token: string, certPem: string) {
  const t = s(token);
  const parts = t.split(".");
  if (parts.length !== 3) return false;
  const data = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
  const sig = b64urlToBuf(parts[2]);
  try {
    return crypto.verify("RSA-SHA256", data, certPem, sig);
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const service = createServiceClient();
  const body = await req.json().catch(() => ({}));

  const token = s(body?.token);
  const codeParam = s(body?.code);
  const credentialId = s(body?.credentialId || body?.digigo_signer_email || "");
  const back_url = s(body?.back_url || "/app") || "/app";

  if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });

  const okJwt = jwtVerifyRs256(token, NDCA_JWT_VERIFY_CERT_PEM);
  if (!okJwt) return NextResponse.json({ ok: false, error: "JWT_INVALID" }, { status: 400 });

  const jti = jwtGetJti(token);
  if (!jti) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });

  const sessRes = await service
    .from("digigo_sign_sessions")
    .select("id,state,invoice_id,back_url,status,expires_at")
    .eq("state", jti)
    .maybeSingle();

  const session: any = sessRes.data;

  if (!session?.id) {
    if (!credentialId) {
      return NextResponse.json(
        { ok: false, error: "SESSION_NOT_FOUND", message: "Aucune session trouvée et credentialId manquant." },
        { status: 400 }
      );
    }

    const code = codeParam || jti;
    const tok = await digigoOauthToken({ credentialId, code });
    if (!tok.ok) {
      const msg = s((tok as any).error || "DIGIGO_TOKEN_FAILED");
      return NextResponse.json({ ok: false, error: "DIGIGO_TOKEN_FAILED", message: msg }, { status: 400 });
    }

    return NextResponse.json(
      { ok: true, mode: "oauth_only", jti, sad: (tok as any).sad || null, back_url },
      { status: 200 }
    );
  }

  const exp = new Date(s(session.expires_at)).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) {
    await service.from("digigo_sign_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
    return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, mode: "session_found", back_url: s(session.back_url) || back_url }, { status: 200 });
}
