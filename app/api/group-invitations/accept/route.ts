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
    .from("group_invitations")
    .select("id, group_id, role, status, expires_at, invited_email")
    .eq("token", token)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });

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

  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    await supabase.from("group_invitations").update({ status: "expired" }).eq("id", inv.id);
    return NextResponse.json({ error: "Invitation expirée." }, { status: 400 });
  }

  // Upsert group_members
  const { data: existing } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", inv.group_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (existing?.id) {
    const { error: up } = await supabase
      .from("group_members")
      .update({ role: inv.role, is_active: true })
      .eq("id", existing.id);
    if (up) return NextResponse.json({ error: up.message }, { status: 400 });
  } else {
    const { error: ins } = await supabase
      .from("group_members")
      .insert({ group_id: inv.group_id, user_id: auth.user.id, role: inv.role, is_active: true });
    if (ins) return NextResponse.json({ error: ins.message }, { status: 400 });
  }

  const { error: updInv } = await supabase
    .from("group_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString(), invited_user_id: auth.user.id })
    .eq("id", inv.id);
  if (updInv) return NextResponse.json({ error: updInv.message }, { status: 400 });

  return NextResponse.json({ ok: true, group_id: inv.group_id });
}
