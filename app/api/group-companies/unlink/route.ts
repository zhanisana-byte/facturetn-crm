import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const companyId = String(body.company_id || "").trim();
  const groupId = String(body.group_id || "").trim();

  if (!companyId || !groupId) {
    return NextResponse.json({ ok: false, error: "company_id et group_id requis" }, { status: 400 });
  }

  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id,owner_user_id")
    .eq("id", companyId)
    .maybeSingle();

  if (cErr || !company?.id) {
    return NextResponse.json({ ok: false, error: cErr?.message || "Société introuvable" }, { status: 404 });
  }

  const userId = auth.user.id;
  const isOwner = company.owner_user_id === userId;

  let isAdmin = false;
  if (!isOwner) {
    const { data: m, error: mErr } = await supabase
      .from("memberships")
      .select("role,is_active")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!mErr && m?.is_active && (m.role === "admin" || m.role === "owner")) {
      isAdmin = true;
    }
  }

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { error: delErr } = await supabase
    .from("group_companies")
    .delete()
    .eq("company_id", companyId)
    .eq("group_id", groupId);

  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
