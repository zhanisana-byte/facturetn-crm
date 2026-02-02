import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const invoiceId = s(id);
  if (!invoiceId) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id, company_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const companyId = s((invoice as any).company_id);
  if (!companyId) return NextResponse.json({ ok: false, error: "INVOICE_NO_COMPANY" }, { status: 404 });

  const { data: sig, error: sigErr } = await supabase
    .from("invoice_signatures")
    .select("signed_xml, state, signed_at")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (sigErr) return NextResponse.json({ ok: false, error: sigErr.message }, { status: 500 });

  const signedXml = s((sig as any)?.signed_xml ?? "");
  const state = s((sig as any)?.state ?? "");

  if (!signedXml || (state && state !== "signed")) {
    return NextResponse.json({ ok: false, error: "NOT_SIGNED" }, { status: 409 });
  }

  return new Response(signedXml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": `attachment; filename="invoice_${invoiceId}_signed.xml"`,
      "cache-control": "no-store",
    },
  });
}
