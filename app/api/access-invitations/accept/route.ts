import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });

  const { data: inv, error: invErr } = await supabase
    .from("access_invitations")
    .select("id, company_id, role, status, expires_at, can_manage_customers, can_create_invoices, can_validate_invoices, can_submit_ttn")
    .eq("token", token)
    .single();

  if (invErr || !inv) return NextResponse.json({ error: invErr?.message || "Invitation introuvable" }, { status: 404 });
  if (inv.status !== "pending") return NextResponse.json({ error: `Invitation déjà ${inv.status}` }, { status: 400 });
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invitation expirée" }, { status: 400 });
  }

  // Mark invitation accepted
  const { error: updErr } = await supabase
    .from("access_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), invited_user_id: auth.user.id })
    .eq("id", inv.id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  // Create membership (idempotent)
  const { data: existing } = await supabase
    .from("memberships")
    .select("id")
    .eq("company_id", inv.company_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existing?.id) {
    const { error: upm } = await supabase
      .from("memberships")
      .update({
        role: inv.role,
        can_manage_customers: inv.can_manage_customers,
        can_create_invoices: inv.can_create_invoices,
        can_validate_invoices: inv.can_validate_invoices,
        can_submit_ttn: inv.can_submit_ttn,
        is_active: true,
      })
      .eq("id", existing.id);
    if (upm) return NextResponse.json({ error: upm.message }, { status: 400 });
  } else {
    const { error: insM } = await supabase.from("memberships").insert({
      company_id: inv.company_id,
      user_id: auth.user.id,
      role: inv.role,
      can_manage_customers: inv.can_manage_customers,
      can_create_invoices: inv.can_create_invoices,
      can_validate_invoices: inv.can_validate_invoices,
      can_submit_ttn: inv.can_submit_ttn,
      is_active: true,
    });
    if (insM) return NextResponse.json({ error: insM.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, company_id: inv.company_id });
}
