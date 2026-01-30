import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Marquer une facture comme déclarée (manuel / auto) ou réinitialiser.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const nextStatus = String(body.status || "").trim();
  const declaration_ref = typeof body.ref === "string" ? body.ref.trim() : null;
  const declaration_note = typeof body.note === "string" ? body.note.trim() : null;
  const declaredAt = typeof body.declaredAt === "string" && body.declaredAt ? body.declaredAt : null;

  if (!id) return NextResponse.json({ ok: false, error: "id requis" }, { status: 400 });
  if (!["none", "manual", "auto"].includes(nextStatus)) {
    return NextResponse.json({ ok: false, error: "status invalide" }, { status: 400 });
  }

  // Charger la facture (RLS filtre déjà) + company_id
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id, company_id")
    .eq("id", id)
    .maybeSingle();

  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  if (!inv) return NextResponse.json({ ok: false, error: "Facture introuvable ou accès refusé" }, { status: 404 });

  // Permission: owner OR can_validate_invoices OR can_create_invoices
  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("role,is_active,can_validate_invoices,can_create_invoices")
    .eq("company_id", (inv as any).company_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 400 });
  const allowed = Boolean(membership?.is_active) &&
    (membership?.role === "owner" || membership?.can_validate_invoices === true || membership?.can_create_invoices === true);

  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 });
  }

  const payload: any = {
    declaration_status: nextStatus,
    declaration_ref,
    declaration_note,
    declared_at: nextStatus === "none" ? null : (declaredAt || new Date().toISOString()),
  };

  const { error: upErr } = await supabase.from("invoices").update(payload).eq("id", id);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
