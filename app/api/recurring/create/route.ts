import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const company_id = String(body.company_id || "").trim();
  const title = String(body.title || "").trim();
  const currency = String(body.currency || "TND").trim() || "TND";
  const cadence = String(body.cadence || "monthly").trim() || "monthly";
  const day_of_month = body.day_of_month == null ? null : Number(body.day_of_month);

  if (!company_id) return NextResponse.json({ ok: false, error: "company_id requis" }, { status: 400 });
  if (!title) return NextResponse.json({ ok: false, error: "title requis" }, { status: 400 });

  const { data: m } = await supabase
    .from("memberships")
    .select("is_active")
    .eq("company_id", company_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!m?.is_active) return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 });

  const { data, error } = await supabase
    .from("recurring_templates")
    .insert({
      company_id,
      title,
      currency,
      cadence,
      day_of_month: Number.isFinite(day_of_month as any) ? day_of_month : null,
      created_by_user_id: auth.user.id,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: (data as any).id });
}
