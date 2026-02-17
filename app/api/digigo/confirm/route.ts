// app/api/digigo/confirm/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { digigoOauthToken, type DigigoEnv } from "@/lib/digigo";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";

    if (!code || !state) {
      return NextResponse.json({ ok: false, error: "MISSING_CODE_OR_STATE" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: sess, error: sessErr } = await supabase
      .from("digigo_sign_sessions")
      .select("id, invoice_id, company_id, environment, status, expires_at, back_url")
      .eq("state", state)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessErr || !sess?.invoice_id) {
      return NextResponse.json({ ok: false, error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const now = Date.now();
    const exp = sess.expires_at ? new Date(sess.expires_at).getTime() : 0;
    if (exp && exp < now) {
      await supabase.from("digigo_sign_sessions").update({ status: "expired" }).eq("id", sess.id);
      return NextResponse.json({ ok: false, error: "SESSION_EXPIRED" }, { status: 400 });
    }

    const environment = (sess.environment || "production") as DigigoEnv;

    const tok = await digigoOauthToken({ code, environment });
    if (!tok.ok) {
      await supabase.from("digigo_sign_sessions").update({ status: "failed", error_message: tok.error }).eq("id", sess.id);
      return NextResponse.json({ ok: false, error: tok.error }, { status: 400 });
    }

    await supabase.from("digigo_sign_sessions").update({ status: "started" }).eq("id", sess.id);

    return NextResponse.json({
      ok: true,
      invoiceId: sess.invoice_id,
      backUrl: sess.back_url || `/invoices/${sess.invoice_id}`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "CONFIRM_FATAL" }, { status: 500 });
  }
}
