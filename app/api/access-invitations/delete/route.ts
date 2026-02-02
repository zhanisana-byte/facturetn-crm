import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  if (!id) return NextResponse.json({ error: "ID manquant." }, { status: 400 });

  const { data: profile } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", user.id)
    .single();

  const myEmail = String(profile?.email || "").toLowerCase();

  const { error } = await supabase
    .from("access_invitations")
    .delete()
    .eq("id", id)
    .or(`invited_by_user_id.eq.${user.id},invited_email.eq.${myEmail}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
