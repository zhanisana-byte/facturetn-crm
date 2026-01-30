import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });

  const { data: inv, error: invErr } = await supabase
    .from("access_invitations")
    .select(
      "id, company_id, role, status, expires_at, invited_email, can_manage_customers, can_create_invoices, can_validate_invoices, can_submit_ttn"
    )
    .eq("token", token)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });

  // Ensure recipient
  const { data: profile } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", auth.user.id)
    .maybeSingle();

  const myEmail = String(profile?.email || auth.user.email || "").toLowerCase();
  if (!myEmail || myEmail !== String(inv.invited_email || "").toLowerCase()) {
    return NextResponse.json({ error: "Cette invitation ne correspond pas à votre email." }, { status: 403 });
  }

  if (inv.status !== "pending") return NextResponse.json({ error: `Invitation déjà ${inv.status}` }, { status: 400 });

  // Expiration
  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    await supabase.from("access_invitations").update({ status: "expired" }).eq("id", inv.id);
    return NextResponse.json({ error: "Invitation expirée." }, { status: 400 });
  }

  // Normaliser le rôle (compat historique: 'admin' -> 'staff')
  const normalizedRole = (() => {
    const r = String(inv.role || "").toLowerCase();
    if (r === "admin") return "staff";
    return r || "viewer";
  })();

  // Upsert membership
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
        role: normalizedRole,
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
      role: normalizedRole,
      can_manage_customers: inv.can_manage_customers,
      can_create_invoices: inv.can_create_invoices,
      can_validate_invoices: inv.can_validate_invoices,
      can_submit_ttn: inv.can_submit_ttn,
      is_active: true,
    });
    if (insM) return NextResponse.json({ error: insM.message }, { status: 400 });
  }

  // Mark invitation accepted and bind user
  const { error: updInv } = await supabase
    .from("access_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), invited_user_id: auth.user.id })
    .eq("id", inv.id);
  if (updInv) return NextResponse.json({ error: updInv.message }, { status: 400 });

  return NextResponse.json({ ok: true, company_id: inv.company_id });
}
