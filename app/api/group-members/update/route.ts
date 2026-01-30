import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const groupMemberId = String(body.group_member_id || "").trim();
  const groupId = String(body.group_id || "").trim();

  if (!groupMemberId || !groupId) {
    return NextResponse.json({ error: "group_member_id et group_id requis" }, { status: 400 });
  }

  // authz: owner or admin can manage
  const { data: group } = await supabase
    .from("groups")
    .select("id,owner_user_id")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });

  const isOwner = group.owner_user_id === auth.user.id;
  let isAdmin = false;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();
    isAdmin = (gm?.role === "admin");
  }

  if (!isOwner && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patch: any = {};
  if (body.role) patch.role = body.role;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  if (body.permissions && typeof body.permissions === "object") patch.permissions = body.permissions;

  const { data, error } = await supabase
    .from("group_members")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", groupMemberId)
    .eq("group_id", groupId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data?.id });
}
