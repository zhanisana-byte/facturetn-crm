import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAuthorizeUrl } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isHttps(req: Request) {
  const proto = s(req.headers.get("x-forwarded-proto") || "");
  if (proto) return proto === "https";
  const app = s(process.env.NEXT_PUBLIC_APP_URL || "");
  return app.startsWith("https://");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const invoice_id_raw = s(body.invoice_id || body.invoiceId || "");
  const invoice_id = invoice_id_raw && isUuid(invoice_id_raw) ? invoice_id_raw : "";

  const back_url = s(body.back_url || body.backUrl || "") || `/invoices/${encodeURIComponent(invoice_id || "")}`;

  const credentialId =
    s(body.credentialId) ||
    s(body.digigo_signer_email) ||
    s(process.env.DIGIGO_CREDENTIAL_ID) ||
    s(auth.user.email);

  if (!credentialId) {
    return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
  }

  const state = crypto.randomUUID();
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const service = createServiceClient();

  async function insertSession(withCredential: boolean) {
    const payload: any = {
      state,
      invoice_id: invoice_id || null,
      company_id: null,
      created_by: auth.user.id,
      back_url,
      status: "pending",
      environment: s(process.env.DIGIGO_ENV || process.env.NODE_ENV || "production"),
      expires_at,
    };
    if (withCredential) payload.credential_id = credentialId;

    return await service
      .from("digigo_sign_sessions")
      .insert(payload)
      .select("id")
      .maybeSingle();
  }

  let insert = await insertSession(true);

  if (insert.error) {
    const msg = s(insert.error.message);
    if (msg.includes("credential_id")) {
      insert = await insertSession(false);
    }
  }

  if (insert.error) {
    return NextResponse.json(
      { ok: false, error: "SESSION_CREATE_FAILED", message: insert.error.message },
      { status: 500 }
    );
  }

  const authorize_url = digigoAuthorizeUrl({
    credentialId,
    hashBase64: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    numSignatures: 1,
    state,
  });

  const res = NextResponse.json({ ok: true, authorize_url, state, back_url }, { status: 200 });

  const secure = isHttps(req);
  const maxAge = 60 * 30;

  res.cookies.set("digigo_state", state, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  res.cookies.set("digigo_back_url", back_url, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  if (invoice_id) {
    res.cookies.set("digigo_invoice_id", invoice_id, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
  }

  return res;
}
