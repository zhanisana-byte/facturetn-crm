import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invitation_id = String(body.invitation_id || "").trim();
  if (!invitation_id) return NextResponse.json({ error: "invitation_id requis" }, { status: 400 });

  const { data: inv, error } = await supabase
    .from("group_invitations")
    .select("id, group_id, invited_by_user_id, status")
    .eq("id", invitation_id)
    .maybeSingle();

  if (error || !inv) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });

  if (inv.status !== "pending") {
    return NextResponse.json({ error: "Seules les invitations en attente peuvent être annulées." }, { status: 400 });
  }

  if (String(inv.invited_by_user_id || "") !== auth.user.id) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", inv.group_id)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    const role = String(gm?.role ?? "").toLowerCase();
    if (!gm?.is_active || !["owner", "admin"].includes(role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }
  }

  const { error: del } = await supabase.from("group_invitations").delete().eq("id", inv.id);
  if (del) return NextResponse.json({ error: del.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
