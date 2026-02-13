import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoOauthToken, jwtGetJti } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

async function safeUpdateInvoiceSigned(service: any, invoiceId: string) {
  const payload: any = { updated_at: new Date().toISOString() };

  const tries: any[] = [
    { ...payload, signature_status: "signed" },
    { ...payload, signature_status: "signed", signature_provider: "digigo" },
    { ...payload, signature_status: "signed", signature_provider: "digigo", ttn_signed: true },
  ];

  for (const p of tries) {
    const r = await service.from("invoices").update(p).eq("id", invoiceId);
    if (!r.error) return true;
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const body = await req.json().catch(() => ({}));

    const token = s(body?.token || "");
    const codeParam = s(body?.code || "");
    const stateFromCookie = s(cookieStore.get("digigo_state")?.value || "");
    const stateFromBody = s(body?.state || "");
    const state = stateFromBody || stateFromCookie;

    const back_url_cookie = s(cookieStore.get("digigo_back_url")?.value || "");
    const back_url_body = s(body?.back_url || body?.backUrl || "");
    const back_url = back_url_body || back_url_cookie || "/app";

    if (!state) {
      return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
    }

    const jti = token ? jwtGetJti(token) : "";
    const code = codeParam || jti;

    if (!code) {
      return NextResponse.json({ ok: false, error: "CODE_MISSING" }, { status: 400 });
    }

    const service = createServiceClient();

    const { data: session, error: sessErr } = await service
      .from("digigo_sign_sessions")
      .select("*")
      .eq("state", state)
      .maybeSingle();

    if (sessErr || !session?.id) {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 400 });
    }

    const exp = new Date(s(session.expires_at)).getTime();
    if (!Number.isFinite(exp) || exp < Date.now()) {
      await service
        .from("digigo_sign_sessions")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", session.id);

      return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
    }

    const credentialId =
      s((session as any).credential_id) ||
      s(body?.credentialId) ||
      s(body?.digigo_signer_email) ||
      s(process.env.DIGIGO_CREDENTIAL_ID);

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

    const tok = await digigoOauthToken({ credentialId, code });
    if (!tok.ok) {
      await service
        .from("digigo_sign_sessions")
        .update({
          status: "failed",
          error_message: s((tok as any).error || "DIGIGO_TOKEN_FAILED"),
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      return NextResponse.json(
        { ok: false, error: "DIGIGO_TOKEN_FAILED", message: s((tok as any).error || "DIGIGO_TOKEN_FAILED") },
        { status: 400 }
      );
    }

    const invoiceId = s((session as any).invoice_id);
    if (invoiceId) {
      await safeUpdateInvoiceSigned(service, invoiceId);
    }

    await service
      .from("digigo_sign_sessions")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", session.id);

    cookieStore.set("digigo_state", "", { path: "/", maxAge: 0 });

    return NextResponse.json(
      { ok: true, jti: code, sad: (tok as any).sad || null, back_url },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
