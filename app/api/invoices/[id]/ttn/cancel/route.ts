import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id  } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id,company_id,ttn_status")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ ok: false, error: invErr?.message || "Facture introuvable" }, { status: 404 });
    }

    if (invoice.ttn_status !== "scheduled") {
      return NextResponse.json(
        { ok: false, error: "Cette facture n'est pas en état 'scheduled'." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    await supabase
      .from("ttn_invoice_queue")
      .update({ status: "canceled", canceled_at: now, updated_at: now })
      .eq("invoice_id", invoice.id)
      .in("status", ["scheduled", "queued"]);

    const { error: upErr } = await supabase
      .from("invoices")
      .update({ ttn_status: "not_sent", ttn_scheduled_at: null })
      .eq("id", invoice.id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    await supabase.from("notifications").insert({
      user_id: auth.user.id,
      type: "ttn_cancel",
      title: "Envoi TTN annulé",
      message: `Facture ${invoice.id} : envoi TTN annulé`,
      is_read: false,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
