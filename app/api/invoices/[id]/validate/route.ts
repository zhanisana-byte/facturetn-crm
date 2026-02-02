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
    .select(
      "id,company_id,invoice_number,issue_date,total_ttc,qr_payload,status,require_accountant_validation,accountant_validated_at,accountant_validated_by,seller_snapshot_at,seller_name,seller_tax_id,seller_street,seller_city,seller_zip,signed_at,signature_status,ttn_status"
    )
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
    .select("role,is_active,can_validate_invoices")
    .eq("company_id", (invoice as any).company_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (mErr) {
    return NextResponse.json({ ok: false, error: mErr.message }, { status: 400 });
  }

  const canValidate = !!membership?.is_active && (membership?.role === "owner" || membership?.can_validate_invoices === true);
  if (!canValidate) {
    return NextResponse.json({ ok: false, error: "Accès refusé (permission validation)." }, { status: 403 });
  }

  if ((invoice as any).accountant_validated_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  if ((invoice as any).require_accountant_validation) {
    const st = String((invoice as any).status || "draft");
    if (st !== "pending_validation") {
      return NextResponse.json(
        {
          ok: false,
          error: "Cette facture n'est pas en attente de validation. cliquez d'abord sur 'Soumettre pour validation'.",
        },
        { status: 400 }
      );
    }
  }

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id, company_name, tax_id, address")
    .eq("id", (invoice as any).company_id)
    .single();

  if (cErr || !company) {
    return NextResponse.json({ ok: false, error: cErr?.message || "Société introuvable" }, { status: 400 });
  }

  const seller_name = (company as any).company_name || null;
  const seller_tax_id = (company as any).tax_id || null;
  const seller_street = (company as any).address || null;
  const seller_city = null;
  const seller_zip = null;

  const existingQr = (invoice as any).qr_payload;
  const qr_payload = existingQr
    ? existingQr
    : JSON.stringify({
      seller_tax_id,
      invoice_number: (invoice as any).invoice_number ?? null,
      issue_date: (invoice as any).issue_date ?? null,
      total_ttc: (invoice as any).total_ttc ?? null,
    });

  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      accountant_validated_by: auth.user.id,
      accountant_validated_at: new Date().toISOString(),
      status: "validated",
      locked_at: new Date().toISOString(),
      seller_snapshot_at: new Date().toISOString(),
      seller_name,
      seller_tax_id,
      seller_street,
      seller_city,
      seller_zip,
      qr_payload,
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
