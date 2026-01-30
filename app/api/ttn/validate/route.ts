import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateInvoiceTTN } from "@/lib/ttn/validate-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ttn/validate?invoiceId=...
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const invoiceId = searchParams.get("invoiceId");
    if (!invoiceId) return NextResponse.json({ ok: false, error: "Missing invoiceId" }, { status: 400 });

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) return NextResponse.json({ ok: false, error: "Invoice not found" }, { status: 404 });

    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("line_no", { ascending: true });

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", (invoice as any).company_id)
      .single();

    const result = validateInvoiceTTN({ invoice, items: items ?? [], company });

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Validation error" }, { status: 500 });
  }
}
