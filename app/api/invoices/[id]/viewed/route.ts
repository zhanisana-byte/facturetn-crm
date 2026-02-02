import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await ctx.params;
  const invoice_id = s(id);
  if (!invoice_id) return NextResponse.json({ ok: false, error: "invoice id required" }, { status: 400 });

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id,company_id")
    .eq("id", invoice_id)
    .maybeSingle();

  const company_id = String((inv as any)?.company_id || "");
  if (invErr || !company_id) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const allowed = await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn");
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const { error } = await supabase.from("invoice_signature_views").upsert(
    {
      invoice_id,
      company_id,
      viewed_by: auth.user.id,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: "invoice_id,viewed_by" }
  );

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
