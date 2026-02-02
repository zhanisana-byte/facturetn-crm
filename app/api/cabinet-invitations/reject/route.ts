import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });

  const { data: inv, error } = await supabase
    .from("group_invitations")
    .select("id, invited_email, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !inv) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });

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

  const { error: upd } = await supabase
    .from("group_invitations")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      invited_user_id: auth.user.id,
    })
    .eq("id", inv.id);

  if (upd) return NextResponse.json({ error: upd.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
