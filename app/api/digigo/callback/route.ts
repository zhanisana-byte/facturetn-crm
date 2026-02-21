import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  const svc = createServiceClient();

  try {
    const body = await req.json().catch(() => ({}));

    const token = s(body.token);
    const invoice_id_body = s(body.invoice_id);
    const state_body = s(body.state);

    const c = await cookies();
    const state_cookie = s(c.get("digigo_state")?.value || "");
    const invoice_cookie = s(c.get("digigo_invoice_id")?.value || "");
    const back_cookie = s(c.get("digigo_back_url")?.value || "");

    const state = state_body || state_cookie;
    const invoice_id = invoice_id_body || invoice_cookie;
    const back_url = back_cookie || `/invoices/${invoice_id}`;

    if (!token) {
      return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });
    }

    if (!state) {
      return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
    }

    if (!invoice_id) {
      return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });
    }

    const sessionRes = await svc
      .from("digigo_sign_sessions")
      .select("id,status")
      .eq("state", state)
      .maybeSingle();

    if (!sessionRes.data) {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const signatureRes = await svc
      .from("invoice_signatures")
      .select("id,unsigned_xml")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    if (!signatureRes.data) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_NOT_FOUND" }, { status: 404 });
    }

    await svc
      .from("invoice_signatures")
      .update({
        state: "signed",
        signed_xml: signatureRes.data.unsigned_xml,
        signed_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", signatureRes.data.id);

    await svc
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        updated_at: nowIso(),
      })
      .eq("id", sessionRes.data.id);

    await svc
      .from("invoices")
      .update({
        signature_status: "signed",
        ttn_signed: true,
        signed_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", invoice_id);

    return NextResponse.json({
      ok: true,
      redirect: back_url,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "CALLBACK_FATAL", details: s(e?.message || e) },
      { status: 500 }
    );
  }
}
