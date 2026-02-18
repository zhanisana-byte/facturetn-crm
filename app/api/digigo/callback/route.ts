import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const svc = createServiceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const state = s(body.state);
    const token = s(body.token);

    if (!state) return NextResponse.json({ ok: false, error: "MISSING_STATE" }, { status: 400 });
    if (!token) return NextResponse.json({ ok: false, error: "MISSING_TOKEN" }, { status: 400 });

    const { data: session, error: sessErr } = await svc
      .from("digigo_sign_sessions")
      .select("id,invoice_id,back_url,company_id,status")
      .eq("state", state)
      .maybeSingle();

    if (sessErr) return NextResponse.json({ ok: false, error: sessErr.message }, { status: 500 });
    if (!session) return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });

    const invoiceId = s(session.invoice_id);

    const { data: sig, error: sigErr } = await svc
      .from("invoice_signatures")
      .select("state,signed_xml,signed_at")
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (sigErr) return NextResponse.json({ ok: false, error: sigErr.message }, { status: 500 });

    const sigState = s((sig as any)?.state).toLowerCase();
    const signedXml = s((sig as any)?.signed_xml);

    if (sigState !== "signed" || !signedXml) {
      await svc
        .from("digigo_sign_sessions")
        .update({
          status: "failed",
          error_message: !sig ? "NO_SIGNATURE_ROW" : !signedXml ? "SIGNED_XML_EMPTY" : "STATE_NOT_SIGNED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      await svc
        .from("invoices")
        .update({
          signature_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      return NextResponse.json({
        ok: true,
        redirect: (session.back_url || `/invoices/${invoiceId}`) + `?sig=missing_xml`,
      });
    }

    await svc
      .from("digigo_sign_sessions")
      .update({
        status: "done",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id);

    await svc
      .from("invoices")
      .update({
        signature_status: "signed",
        ttn_signed: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    return NextResponse.json({
      ok: true,
      redirect: session.back_url || `/invoices/${invoiceId}`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "CALLBACK_FATAL", details: s(e?.message || e) }, { status: 500 });
  }
}
