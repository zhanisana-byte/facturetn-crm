import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const membershipId = String(body.membership_id || "").trim();
  const companyId = String(body.company_id || "").trim();

  if (!membershipId || !companyId) {
    return NextResponse.json({ error: "membership_id et company_id requis" }, { status: 400 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id,owner_user_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id || company.owner_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("memberships")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("company_id", companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
