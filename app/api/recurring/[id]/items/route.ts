import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const description = String(body.description || "").trim();
  const qty = Number(body.qty ?? 1);
  const price = Number(body.price ?? 0);
  const vat = Number(body.vat ?? 0);
  const discount = Number(body.discount ?? 0);

  if (!id) return NextResponse.json({ ok: false, error: "id requis" }, { status: 400 });
  if (!description) return NextResponse.json({ ok: false, error: "description requise" }, { status: 400 });

  const { data: tpl, error: tErr } = await supabase
    .from("recurring_templates")
    .select("id,company_id")
    .eq("id", id)
    .maybeSingle();

  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 400 });
  if (!tpl) return NextResponse.json({ ok: false, error: "Template introuvable" }, { status: 404 });

  const { data: m } = await supabase
    .from("memberships")
    .select("is_active")
    .eq("company_id", (tpl as any).company_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!m?.is_active) return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 });

  const { data: last } = await supabase
    .from("recurring_template_items")
    .select("position")
    .eq("template_id", id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPos = Number((last as any)?.position ?? 0) + 1;

  const { error } = await supabase
    .from("recurring_template_items")
    .insert({
      template_id: id,
      position: nextPos,
      description,
      qty: Number.isFinite(qty) ? qty : 1,
      price: Number.isFinite(price) ? price : 0,
      vat: Number.isFinite(vat) ? vat : 0,
      discount: Number.isFinite(discount) ? discount : 0,
    });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
