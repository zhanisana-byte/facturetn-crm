import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id,company_id,status,require_accountant_validation,signed_at,signature_status,ttn_status")
    .eq("id", id)
    .maybeSingle();

  if (invErr) {
    return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  }
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Facture introuvable ou accès refusé." }, { status: 404 });
  }

  // Security checks
  const isSigned = !!(invoice as any).signed_at || (invoice as any).signature_status === "signed";
  const ttnStatus = (invoice as any).ttn_status || "draft";
  const isLocked = !["draft", "not_sent", "error", "failed"].includes(ttnStatus);

  if (isSigned || isLocked) {
    return NextResponse.json({ ok: false, error: "Invoice is locked/signed and cannot be modified." }, { status: 409 });
  }

  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("role,is_active,can_create_invoices")
    .eq("company_id", (invoice as any).company_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (mErr) {
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 400 });
  }

  const canSubmit =
    !!membership?.is_active && (membership?.role === "owner" || membership?.can_create_invoices === true);

  if (!canSubmit) {
    return NextResponse.json({ ok: false, error: "Accès refusé (permission création/soumission)." }, { status: 403 });
  }

  if (!(invoice as any).require_accountant_validation) {
    return NextResponse.json({ ok: true, skipped: true, message: "Validation non requise pour cette facture." });
  }

  const currentStatus = String((invoice as any).status || "draft");
  if (currentStatus === "pending_validation") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (currentStatus === "validated") {
    return NextResponse.json({ ok: true, already_validated: true });
  }

  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      status: "pending_validation",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
