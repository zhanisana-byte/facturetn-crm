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

  // authz: only company owner can edit roles/permissions
  const { data: company } = await supabase
    .from("companies")
    .select("id,owner_user_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id || company.owner_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const patch: any = {};
  if (body.role) patch.role = body.role;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;
  for (const k of ["can_manage_customers","can_create_invoices","can_validate_invoices","can_submit_ttn"]) {
    if (typeof body[k] === "boolean") patch[k] = body[k];
  }

  const { data, error } = await supabase
    .from("memberships")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", membershipId)
    .eq("company_id", companyId)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data?.id });
}
