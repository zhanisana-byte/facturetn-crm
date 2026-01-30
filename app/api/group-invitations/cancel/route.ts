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
    .from("group_invitations")
    .select("id, status, invited_by_user_id")
    .eq("token", token)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  if (inv.invited_by_user_id !== auth.user.id) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  if (inv.status !== "pending") return NextResponse.json({ error: `Invitation déjà ${inv.status}` }, { status: 400 });

  const { error: upd } = await supabase.from("group_invitations").update({ status: "revoked" }).eq("id", inv.id);
  if (upd) return NextResponse.json({ error: upd.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
