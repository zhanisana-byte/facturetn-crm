import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(_req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  if (!itemId) return NextResponse.json({ ok: false, error: "itemId requis" }, { status: 400 });

  const { data: it, error: itErr } = await supabase
    .from("recurring_template_items")
    .select("id,template_id")
    .eq("id", itemId)
    .maybeSingle();

  if (itErr) return NextResponse.json({ ok: false, error: itErr.message }, { status: 400 });
  if (!it) return NextResponse.json({ ok: false, error: "Ligne introuvable" }, { status: 404 });

  const { data: tpl } = await supabase
    .from("recurring_templates")
    .select("id,company_id")
    .eq("id", (it as any).template_id)
    .maybeSingle();

  if (!tpl) return NextResponse.json({ ok: false, error: "Template introuvable" }, { status: 404 });

  const { data: m } = await supabase
    .from("memberships")
    .select("is_active")
    .eq("company_id", (tpl as any).company_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!m?.is_active) return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 });

  const { error } = await supabase.from("recurring_template_items").delete().eq("id", itemId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
