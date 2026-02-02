import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const dynamic = "force-dynamic";

function isSignatureBlocking(sig: any | null | undefined): boolean {
  if (!sig) return false;
  const state = typeof sig.state === "string" ? sig.state.toLowerCase() : "";
  if (state === "signed") return true;
  const signedXml = typeof sig.signed_xml === "string" ? sig.signed_xml.trim() : "";
  if (signedXml.length > 0) return true;
  if (sig.signed_at) return true;
  return false;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id,company_id,status,require_accountant_validation,signed_at,signature_status,ttn_status")
    .eq("id", id)
    .maybeSingle();

  if (invErr) {
    return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  }
  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Facture introuvable ou accès refusé." }, { status: 404 });
  }

  const companyId = String((invoice as any).company_id || "");
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Invoice has no company" }, { status: 400 });
  }

  const allowed = await canCompanyAction(supabase, auth.user.id, companyId, "create_invoices");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Accès refusé (permission création/soumission)." }, { status: 403 });
  }

  const { data: sig, error: sigErr } = await supabase
    .from("invoice_signatures")
    .select("state,signed_xml,signed_at")
    .eq("invoice_id", id)
    .maybeSingle();

  if (sigErr) {
    return NextResponse.json({ ok: false, error: sigErr.message }, { status: 400 });
  }

  const isSignedLegacy = !!(invoice as any).signed_at || (invoice as any).signature_status === "signed";
  const isSigned = isSignedLegacy || isSignatureBlocking(sig);

  const ttnStatus = (invoice as any).ttn_status || "draft";
  const isLocked = !["draft", "not_sent", "error", "failed"].includes(ttnStatus);

  if (isSigned || isLocked) {
    return NextResponse.json({ ok: false, error: "Invoice is locked/signed and cannot be modified." }, { status: 409 });
  }

  if (!(invoice as any).require_accountant_validation) {
    return NextResponse.json({ ok: true, skipped: true, message: "Validation non requise pour cette facture." });
  }

  const currentStatus = String((invoice as any).status || "draft");
  if (currentStatus === "pending_validation") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (currentStatus === "validated") {
    return NextResponse.json({ ok: true, already_validated: true });
  }

  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      status: "pending_validation",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
