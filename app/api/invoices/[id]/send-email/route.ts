import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// NOTE: Email provider integration is intentionally a placeholder.
// This route logs the send request in `invoice_email_logs`.

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const to_email = String(body?.to_email || "").trim();
  const subject = String(body?.subject || "Facture").trim();
  const message = body?.message ? String(body.message) : null;

  if (!to_email) {
    return NextResponse.json(
      { ok: false, error: "Email destinataire manquant" },
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
    .select("id")
    .eq("id", id)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json(
      { ok: false, error: invErr?.message || "Invoice not found" },
      { status: 404 }
    );
  }

  const { error: logErr } = await supabase.from("invoice_email_logs").insert({
    invoice_id: id,
    sent_by: auth.user.id,
    to_email,
    subject,
    message,
    status: "queued",
    provider: "placeholder",
  });

  if (logErr) {
    return NextResponse.json({ ok: false, error: logErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "queued" });
}
