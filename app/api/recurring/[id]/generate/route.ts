
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function monthBounds(ym: string) {
  
  const [Y, M] = ym.split("-").map((x) => Number(x));
  const from = new Date(Date.UTC(Y, M - 1, 1));
  const to = new Date(Date.UTC(Y, M, 0)); 
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({} as any))) as {
    billing_period?: string; 
    validate?: boolean;
  };

  const billing_period = String(body.billing_period ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(billing_period)) {
    return NextResponse.json(
      { ok: false, error: "BILLING_PERIOD_INVALID", message: "Format attendu: YYYY-MM" },
      { status: 400 }
    );
  }

  const { data: tpl, error: tplErr } = await supabase
    .from("recurring_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (tplErr || !tpl) {
    return NextResponse.json(
      { ok: false, error: tplErr?.message ?? "TEMPLATE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const companyId = String((tpl as any).company_id ?? "");
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "COMPANY_ID_MISSING" }, { status: 400 });
  }

  const allowed = await canCompanyAction(supabase, auth.user.id, companyId, "create_invoices");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from("recurring_template_items")
    .select("*")
    .eq("template_id", id)
    .order("position", { ascending: true });

  if (itemsErr) {
    return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
  }
  if (!items?.length) {
    return NextResponse.json(
      { ok: false, error: "NO_ITEMS", message: "Ajoute au moins 1 ligne au modèle." },
      { status: 400 }
    );
  }

  const { from, to } = monthBounds(billing_period);

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      company_id: companyId,
      currency: String((tpl as any).currency ?? "TND"),
      issue_date: new Date().toISOString().slice(0, 10),

      billing_period,
      period_from: from,
      period_to: to,

      invoice_mode: "permanente",
      created_in_mode: "permanente",
      created_by_user_id: auth.user.id,

      recurring_template_id: id,
    })
    .select("id")
    .single();

  if (invErr || !invoice) {
    return NextResponse.json(
      { ok: false, error: invErr?.message ?? "INVOICE_CREATE_FAILED" },
      { status: 500 }
    );
  }

  const invoice_id = String((invoice as any).id);

  const payload = items.map((it: any, idx: number) => ({
    invoice_id,
    line_no: idx + 1,
    description: String(it.description ?? ""),
    quantity: Number(it.qty ?? 1),
    unit_price_ht: Number(it.price ?? 0),
    vat_pct: Number(it.vat ?? 0),
    discount_pct: Number(it.discount ?? 0),
  }));

  const { error: insItemsErr } = await supabase.from("invoice_items").insert(payload);
  if (insItemsErr) {
    return NextResponse.json({ ok: false, error: insItemsErr.message }, { status: 500 });
  }

  try {
    await supabase.rpc("compute_invoice_totals", { p_invoice_id: invoice_id } as any);
  } catch {
    
  }

  return NextResponse.json({ ok: true, invoice_id });
}
