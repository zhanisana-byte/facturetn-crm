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

  const { data: inv } = await supabase
    .from("group_company_invitations")
    .select("id,group_id,status,created_by_user_id")
    .eq("id", id)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
  if (inv.status !== "pending") return NextResponse.json({ error: "Invitation déjà traitée" }, { status: 409 });

  let allowed = inv.created_by_user_id === auth.user.id;

  if (!allowed) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role")
      .eq("group_id", inv.group_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    allowed = gm?.role === "owner" || gm?.role === "admin";
  }

  if (!allowed) {
    const { data: g } = await supabase.from("groups").select("owner_user_id").eq("id", inv.group_id).maybeSingle();
    allowed = g?.owner_user_id === auth.user.id;
  }

  if (!allowed) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const { error } = await supabase
    .from("group_company_invitations")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
