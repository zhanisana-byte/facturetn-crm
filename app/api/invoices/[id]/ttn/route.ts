import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readSignedXml(inv: any) {
  const rel = inv?.invoice_signatures;
  if (!rel) return null;
  if (Array.isArray(rel)) return rel?.[0]?.signed_xml || null;
  return rel?.signed_xml || null;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id,company_id,document_type,ttn_status,invoice_signatures(signed_xml)")
    .eq("id", id)
    .maybeSingle();

  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  if (!inv) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const docType = String(inv.document_type || "facture").toLowerCase();
  if (docType === "devis") {
    return NextResponse.json({ ok: false, error: "DOC_TYPE_NOT_TTN" }, { status: 409 });
  }

  const ttnStatus = String(inv.ttn_status || "not_sent");
  if (ttnStatus !== "not_sent") {
    return NextResponse.json({ ok: false, error: "INVOICE_LOCKED_TTN" }, { status: 409 });
  }

  const { data: settings, error: sErr } = await supabase
    .from("company_settings")
    .select("signature_required,validation_required")
    .eq("company_id", inv.company_id)
    .maybeSingle();

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 });

  const signatureRequired = Boolean(settings?.signature_required);
  const signedXml = readSignedXml(inv);

  if (signatureRequired && !signedXml) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_REQUIRED" }, { status: 409 });
  }

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ ttn_status: "queued", ttn_last_action_at: new Date().toISOString() })
    .eq("id", id);

  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, ttn_status: "queued" });
}
