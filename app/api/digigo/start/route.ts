import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const invoiceId = s(body?.invoiceId);
  const companyId = s(body?.companyId);
  const credentialId = s(body?.credentialId);
  const backUrl = s(body?.backUrl);
  const env = s(body?.environment || "test");

  if (!credentialId) {
    return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
  }
  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
  }

  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const service = createServiceClient();

  const { error } = await service.from("digigo_sign_sessions").insert({
    state,
    invoice_id: invoiceId,
    company_id: companyId || null,
    credential_id: credentialId,
    created_by: s(body?.createdBy) || null,
    back_url: backUrl || null,
    status: "pending",
    environment: env || null,
    expires_at: expiresAt,
  } as any);

  if (error) {
    return NextResponse.json({ ok: false, error: "DB_INSERT_FAILED", message: error.message }, { status: 500 });
  }

  const cookieStore = await cookies();
  cookieStore.set("digigo_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.json({ ok: true, state }, { status: 200 });
}
