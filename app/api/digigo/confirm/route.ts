// app/api/digigo/confirm/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractJwtJti, digigoOauthTokenFromJti } from "@/lib/digigo";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || "";
    const state = url.searchParams.get("state") || "";

    if (!token || !state) {
      return NextResponse.json({ ok: false, error: "MISSING_TOKEN_OR_STATE" }, { status: 400 });
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

    const { jti } = extractJwtJti(token);
    const { sad } = await digigoOauthTokenFromJti({ jti });

    await supabase
      .from("digigo_sign_sessions")
      .update({ status: "started", updated_at: new Date().toISOString() })
      .eq("id", sess.id);

    const { data: sig, error: sigErr } = await supabase
      .from("invoice_signatures")
      .select("id, meta")
      .eq("invoice_id", sess.invoice_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sigErr || !sig?.id) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_ROW_NOT_FOUND" }, { status: 404 });
    }

    await supabase
      .from("invoice_signatures")
      .update({
        meta: {
          ...(sig.meta || {}),
          state,
          jti,
          sad,
          tokenJwt: token,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", sig.id);

    return NextResponse.json({
      ok: true,
      invoiceId: sess.invoice_id,
      backUrl: sess.back_url || `/invoices/${sess.invoice_id}`,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "CONFIRM_FATAL" }, { status: 500 });
  }
}
