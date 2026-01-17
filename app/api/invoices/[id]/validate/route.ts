import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Accountant validation endpoint.
 * - Ensures user is authenticated
 * - Ensures user has permission (owner OR membership.can_validate_invoices)
 * - Snapshots seller (company) fields into invoice for legal/history stability
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id  } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Load invoice (RLS should already filter access, but we still validate permissions)
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select(
      "id,company_id,status,require_accountant_validation,accountant_validated_at,accountant_validated_by,seller_snapshot_at,seller_name,seller_tax_id,seller_street,seller_city,seller_zip"
    )
    .eq("id", id)
    .maybeSingle();

  if (invErr) {
    return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  }
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Facture introuvable ou accès refusé." }, { status: 404 });
  }

  // Permission check: owner OR membership with can_validate_invoices
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
    // Already validated
    return NextResponse.json({ ok: true, already: true });
  }

  // Si la validation est requise, on force un passage par "pending_validation"
  if ((invoice as any).require_accountant_validation) {
    const st = String((invoice as any).status || "draft");
    if (st !== "pending_validation") {
      return NextResponse.json(
        {
          ok: false,
          error: "Cette facture n'est pas en attente de validation. Clique d'abord sur 'Soumettre pour validation'.",
        },
        { status: 400 }
      );
    }
  }

  // Load company fields to snapshot
  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id,tax_id,name,company_name,street,address,city,zip,postal_code")
    .eq("id", (invoice as any).company_id)
    .single();

  if (cErr || !company) {
    return NextResponse.json({ ok: false, error: cErr?.message || "Société introuvable" }, { status: 400 });
  }

  const seller_name = (company as any).name || (company as any).company_name || null;
  const seller_tax_id = (company as any).tax_id || null;
  const seller_street = (company as any).street || (company as any).address || null;
  const seller_city = (company as any).city || null;
  const seller_zip = (company as any).zip || (company as any).postal_code || null;

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
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
