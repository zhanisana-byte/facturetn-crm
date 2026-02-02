import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSigned(inv: any) {
  const st = String(inv?.signature_status || "").toLowerCase();
  return st === "signed" || Boolean(inv?.signed_at) || Boolean(inv?.signed_xml) || Boolean(inv?.signature_xml);
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { data: invoice, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error || !invoice) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const docType = String((invoice as any).document_type || "facture").toLowerCase();
  if (docType === "devis") {
    return NextResponse.json({ ok: false, error: "DOC_TYPE_NOT_TTN" }, { status: 409 });
  }

  const signatureRequired = Boolean((invoice as any).signature_required ?? true);
  if (signatureRequired && !isSigned(invoice)) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_REQUIRED" }, { status: 409 });
  }

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ ttn_status: "queued", ttn_last_action_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, ttn_status: "queued" });
}
