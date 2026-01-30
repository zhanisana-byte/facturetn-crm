import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id,company_id,ttn_status")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ ok: false, error: invErr?.message || "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const companyId = String((invoice as any).company_id || "");
    if (!companyId) return NextResponse.json({ ok: false, error: "COMPANY_ID_MISSING" }, { status: 400 });

    const allowed = await canCompanyAction(supabase, auth.user.id, companyId, "submit_ttn");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    if (String((invoice as any).ttn_status || "not_sent") !== "scheduled") {
      return NextResponse.json({ ok: false, error: "NOT_SCHEDULED" }, { status: 409 });
    }

    const now = new Date().toISOString();

    await supabase
      .from("ttn_invoice_queue")
      .update({ status: "canceled", canceled_at: now, updated_at: now })
      .eq("invoice_id", (invoice as any).id)
      .in("status", ["scheduled", "queued"]);

    const { error: upErr } = await supabase
      .from("invoices")
      .update({ ttn_status: "not_sent", ttn_scheduled_at: null })
      .eq("id", (invoice as any).id);

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    await supabase.from("notifications").insert({
      user_id: auth.user.id,
      type: "ttn_cancel",
      title: "Envoi TTN annulé",
      message: `Facture ${(invoice as any).id} : envoi TTN annulé`,
      is_read: false,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "SERVER_ERROR" }, { status: 500 });
  }
}
