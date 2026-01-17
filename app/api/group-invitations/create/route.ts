import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function token() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const group_id = String(body.group_id || "").trim();
  const invited_email = String(body.invited_email || "").trim().toLowerCase();
  const role = String(body.role || "staff").trim();
  const objective = String(body.objective || "").trim();

  if (!group_id) return NextResponse.json({ error: "group_id requis" }, { status: 400 });
  if (!invited_email || !invited_email.includes("@")) return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  if (!["owner","admin","staff"].includes(role)) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });

  // Permission: owner/admin of group
  const { data: gm } = await supabase
    .from("group_members")
    .select("id, role")
    .eq("group_id", group_id)
    .eq("user_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!gm?.id || !["owner","admin"].includes(String(gm.role))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  // Optional: bind invited_user_id if already exists
  const { data: invitedUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", invited_email)
    .maybeSingle();

  const payload: any = {
    group_id,
    invited_email,
    invited_by_user_id: auth.user.id,
    role,
    objective: objective || null,
    token: token(),
    status: "pending",
    invited_user_id: invitedUser?.id ?? null,
  };

  const { data, error } = await supabase
    .from("group_invitations")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Build invite link
  const originFromReq = (() => {
    try {
      return new URL((req as any).url).origin;
    } catch {
      return "";
    }
  })();

  let base = (process.env.NEXT_PUBLIC_SITE_URL || originFromReq || "").trim();
  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/+$/, "");

  const inviteLink = `${base}/groups/invitations?token=${encodeURIComponent(data.token)}`;

  return NextResponse.json({ ok: true, invitation: data, inviteLink });
}
