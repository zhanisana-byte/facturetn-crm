import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findLastPendingSession(service: any) {
  const nowIso = new Date().toISOString();

  const r = await service
    .from("digigo_sign_sessions")
    .select("id,state,invoice_id,back_url,status,expires_at,created_at")
    .eq("status", "pending")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return r.data || null;
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const body = await req.json().catch(() => ({} as any));

  const service = createServiceClient();

  const stateFromBody = s(body?.state || "");
  const stateFromCookie = s(cookieStore.get("digigo_state")?.value || "");
  const state = stateFromBody || stateFromCookie;

  const invoiceFromBody = s(body?.invoice_id || body?.invoiceId || "");
  const invoiceFromCookie = s(cookieStore.get("digigo_invoice_id")?.value || "");
  let invoice_id = invoiceFromBody || invoiceFromCookie;

  const backFromBody = s(body?.back_url || body?.backUrl || body?.back || "");
  const backFromCookie = s(cookieStore.get("digigo_back_url")?.value || "");
  let back_url = backFromBody || backFromCookie || "/app";

  let session: any = null;

  if (state && isUuid(state)) {
    const r = await service
      .from("digigo_sign_sessions")
      .select("id,state,invoice_id,back_url,status,expires_at")
      .eq("state", state)
      .maybeSingle();

    if (r.data?.id) session = r.data;
  }

  if (!session?.id) {
    session = await findLastPendingSession(service);
  }

  if (!session?.id) {
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

  invoice_id = invoice_id || s(session.invoice_id || "");
  back_url = s(session.back_url || "") || back_url;

  if (!invoice_id || !isUuid(invoice_id)) {
    return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
  }

  cookieStore.set("digigo_state", "", { path: "/", maxAge: 0 });
  cookieStore.set("digigo_invoice_id", "", { path: "/", maxAge: 0 });
  cookieStore.set("digigo_back_url", "", { path: "/", maxAge: 0 });

  return NextResponse.json(
    { ok: true, state: s(session.state || state), invoice_id, back_url },
    { status: 200 }
  );
}
