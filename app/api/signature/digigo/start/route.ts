import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAuthorizeUrl } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function addMinutes(min: number) {
  return new Date(Date.now() + min * 60 * 1000).toISOString();
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return crypto.randomBytes(16).toString("hex");
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const service = createServiceClient();

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body?.invoice_id || body?.invoiceId || "");
  const back_url = s(body?.back_url || body?.backUrl || body?.back || "");
  const environment = s(body?.environment || "test") || "test";
  const created_by = s(body?.created_by || body?.user_id || "");

  if (!invoice_id) return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });

  const inv = await service.from("invoices").select("id, company_id").eq("id", invoice_id).maybeSingle();
  if (!inv.data?.id) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const state = uuid();

  await service.from("digigo_sign_sessions").insert({
    state,
    invoice_id,
    company_id: inv.data.company_id,
    created_by: created_by || null,
    status: "pending",
    environment,
    expires_at: addMinutes(10),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  cookieStore.set("digigo_state", state, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
  cookieStore.set("digigo_invoice_id", invoice_id, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });
  cookieStore.set("digigo_back_url", back_url, { path: "/", httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 });

  const authorize_url = digigoAuthorizeUrl({ state });

  return NextResponse.json({ ok: true, authorize_url, state, invoice_id, redirect: "/digigo/redirect" });
}
