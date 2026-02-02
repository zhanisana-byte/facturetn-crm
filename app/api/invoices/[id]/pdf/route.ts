import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSigned(inv: any) {
  if (!inv) return false;
  const st = String(inv.signature_status || "").toLowerCase();
  if (st === "signed") return true;
  if (inv.signed_at) return true;
  if (inv.signature_xml || inv.signed_xml) return true;
  return Boolean(inv.invoice_signed);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const { data: current, error: e1 } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (e1 || !current) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  if (isSigned(current)) {
    return NextResponse.json({ ok: false, error: "INVOICE_LOCKED_SIGNED" }, { status: 409 });
  }

  const allowed: any = {};
  const keys = [
    "issue_date",
    "due_date",
    "invoice_number",
    "customer_name",
    "customer_tax_id",
    "customer_address",
    "customer_email",
    "customer_phone",
    "destination",
    "currency",
    "stamp_enabled",
    "stamp_amount",
    "notes",
  ];

  for (const k of keys) {
    if (k in body) allowed[k] = body[k];
  }

  const { data, error } = await supabase.from("invoices").update(allowed).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, invoice: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { data: current, error: e1 } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (e1 || !current) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  if (isSigned(current)) {
    return NextResponse.json({ ok: false, error: "INVOICE_LOCKED_SIGNED" }, { status: 409 });
  }

  const { error: eItems } = await supabase.from("invoice_items").delete().eq("invoice_id", id);
  if (eItems) return NextResponse.json({ ok: false, error: eItems.message }, { status: 400 });

  const { error: eInv } = await supabase.from("invoices").delete().eq("id", id);
  if (eInv) return NextResponse.json({ ok: false, error: eInv.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
