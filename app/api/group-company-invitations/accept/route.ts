import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const email = (auth.user.email || "").toLowerCase();

  const { data: inv, error: invErr } = await supabase
    .from("group_company_invitations")
    .select("id,group_id,company_id,invited_email,status")
    .eq("id", id)
    .maybeSingle();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 });
  if (!inv) return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
  if (inv.status !== "pending") return NextResponse.json({ error: "Invitation déjà traitée" }, { status: 409 });
  if ((inv.invited_email || "").toLowerCase() !== email) {
    return NextResponse.json({ error: "Email invité ne correspond pas" }, { status: 403 });
  }

  // Ensure invited user is owner/admin of the company
  const { data: c } = await supabase
    .from("companies")
    .select("id,owner_user")
    .eq("id", inv.company_id)
    .maybeSingle();

  const isOwner = c?.owner_user === auth.user.id;

  let isAdmin = false;
  if (!isOwner) {
    const { data: m } = await supabase
      .from("memberships")
      .select("role")
      .eq("company_id", inv.company_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    isAdmin = m?.role === "owner" || m?.role === "admin";
  }

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "vous n'as pas le droit de lier cette société (owner/admin requis)." }, { status: 403 });
  }

  // Link as external
  const { error: linkErr } = await supabase.from("group_companies").insert({
    group_id: inv.group_id,
    company_id: inv.company_id,
    link_type: "external",
    added_by_user_id: auth.user.id,
  });

  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

  const { error: upErr } = await supabase
    .from("group_company_invitations")
    .update({
      status: "accepted",
      invited_user_id: auth.user.id,
      responded_at: new Date().toISOString(),
    })
    .eq("id", inv.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
