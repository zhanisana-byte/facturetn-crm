import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id,company_id")
    .eq("id", id)
    .single();

  if (invErr || !inv) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
  const companyId = String((inv as any).company_id || "");
  const ok = await canCompanyAction(supabase, auth.user.id, companyId, "submit_ttn");
  if (!ok) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const { data: sig } = await supabase
    .from("invoice_signatures")
    .select("signed_xml,environment")
    .eq("invoice_id", id)
    .maybeSingle();

  if (!sig?.signed_xml) return NextResponse.json({ ok: false, error: "SIGNATURE_NOT_FOUND" }, { status: 404 });

  return new NextResponse(String(sig.signed_xml), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `inline; filename="invoice-${id}-signed.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
