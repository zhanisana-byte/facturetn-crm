import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSigned(inv: any) {
  const st = String(inv?.signature_status || "").toLowerCase();
  return st === "signed" || Boolean(inv?.signed_at) || Boolean(inv?.signed_xml) || Boolean(inv?.signature_xml);
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error || !invoice) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  if (!isSigned(invoice)) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_REQUIRED" }, { status: 409 });
  }

  const xml = String((invoice as any).signed_xml || (invoice as any).signature_xml || "");
  if (!xml) return NextResponse.json({ ok: false, error: "SIGNED_XML_MISSING" }, { status: 404 });

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoice-${id}-signed.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
