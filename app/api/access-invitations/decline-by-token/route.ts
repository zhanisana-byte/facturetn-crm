import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || "").trim();
  if (!token) return NextResponse.json({ error: "Token manquant." }, { status: 400 });

  // Email utilisateur (pour vérifier que c’est bien le destinataire)
  const { data: profile } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", user.id)
    .single();

  const myEmail = String(profile?.email || "").toLowerCase();

  const { error } = await supabase
    .from("access_invitations")
    .update({ status: "declined", declined_at: new Date().toISOString() })
    .eq("token", token)
    .eq("invited_email", myEmail)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Invitation refusée. Redirection…" });
}
