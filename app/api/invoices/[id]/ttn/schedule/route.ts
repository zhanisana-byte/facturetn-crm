import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id  } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const scheduledAtRaw = String(body?.scheduled_at || body?.send_at || "").trim();
    const scheduled_at = scheduledAtRaw ? new Date(scheduledAtRaw) : new Date(Date.now() + 10 * 60 * 1000);

    if (Number.isNaN(scheduled_at.getTime())) {
      return NextResponse.json(
        { ok: false, error: "Date/heure invalide." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id,company_id,accountant_validated_at")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json(
        { ok: false, error: invErr?.message || "Facture introuvable" },
        { status: 404 }
      );
    }

    if (!invoice.accountant_validated_at) {
      return NextResponse.json(
        { ok: false, error: "Validation comptable requise avant programmation TTN." },
        { status: 400 }
      );
    }

    // Upsert queue
    const { error: qErr } = await supabase.from("ttn_invoice_queue").upsert(
      {
        invoice_id: invoice.id,
        company_id: invoice.company_id,
        scheduled_at: scheduled_at.toISOString(),
        status: "scheduled",
        last_error: null,
        created_by: auth.user.id,
      },
      { onConflict: "invoice_id" }
    );

    if (qErr) {
      return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });
    }

    const { error: upErr } = await supabase
      .from("invoices")
      .update({ ttn_status: "scheduled", ttn_scheduled_at: scheduled_at.toISOString() })
      .eq("id", invoice.id);

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // Notification reminder
    await supabase.from("notifications").insert({
      user_id: auth.user.id,
      type: "ttn_scheduled",
      title: "Envoi TTN programmé",
      message: `Facture ${invoice.id} programmée pour ${scheduled_at.toISOString()}`,
      is_read: false,
    });

    return NextResponse.json({ ok: true, scheduled_at: scheduled_at.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
