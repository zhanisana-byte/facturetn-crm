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

  const { data: inv } = await supabase
    .from("group_company_invitations")
    .select("id,invited_email,status")
    .eq("id", id)
    .maybeSingle();

  if (!inv) return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
  if (inv.status !== "pending") return NextResponse.json({ error: "Invitation déjà traitée" }, { status: 409 });
  if ((inv.invited_email || "").toLowerCase() !== email) {
    return NextResponse.json({ error: "Email invité ne correspond pas" }, { status: 403 });
  }

  const { error } = await supabase
    .from("group_company_invitations")
    .update({ status: "declined", invited_user_id: auth.user.id, responded_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
