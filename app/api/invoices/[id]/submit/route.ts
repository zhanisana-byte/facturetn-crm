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
    .select("id,company_id,signature_status,ttn_status,status")
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

  // Permission (ex: staff peut soumettre si autorisé)
  const allowed = await canCompanyAction(supabase, auth.user.id, companyId, "create_invoices");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Accès refusé (permission création/soumission)." }, { status: 403 });
  }

  // Signature réelle est dans invoice_signatures (pas invoices.signed_at)
  const { data: sig, error: sigErr } = await supabase
    .from("invoice_signatures")
    .select("state,signed_xml,signed_at")
    .eq("invoice_id", id)
    .maybeSingle();

  if (sigErr) {
    return NextResponse.json({ ok: false, error: sigErr.message }, { status: 400 });
  }

  const legacySigned = String((invoice as any).signature_status || "").toLowerCase() === "signed";
  const signed = legacySigned || isSignatureBlocking(sig);

  if (!signed) {
    return NextResponse.json(
      { ok: false, error: "Cette facture n'est pas signée. Veuillez signer avant soumission TTN." },
      { status: 409 },
    );
  }

  // Optionnel: éviter double soumission si déjà submitted/accepted
  const ttnStatus = String((invoice as any).ttn_status || "not_sent").toLowerCase();
  if (["submitted", "accepted"].includes(ttnStatus)) {
    return NextResponse.json({ ok: true, already: true });
  }

  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from("invoices")
    .update({
      status: "ready_to_send",
      ttn_status: "scheduled",
      ttn_scheduled_at: now,
      ttn_submitted_by: auth.user.id,
    })
    .eq("id", id);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
