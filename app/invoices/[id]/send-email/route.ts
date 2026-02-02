import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id  } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const toEmail = String(body?.toEmail || "").trim();
  const subject = String(body?.subject || "Facture - FactureTN").trim();
  const message = String(body?.message || "").trim();

  if (!toEmail) {
    return NextResponse.json({ ok: false, error: "Destinataire obligatoire" }, { status: 400 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id")
    .eq("id", id)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json({ ok: false, error: invErr?.message || "Invoice not found" }, { status: 404 });
  }

  const { error: logErr } = await supabase.from("invoice_email_logs").insert({
    invoice_id: id,
    sent_by: auth.user.id,
    to_email: toEmail,
    subject,
    message,
    status: "sent",
    provider: "placeholder",
    provider_message_id: null,
    error: null,
  });

  if (logErr) {
    return NextResponse.json({ ok: false, error: logErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
