import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isInvoiceSignedLegacy(inv: Record<string, any> | null | undefined): boolean {
  if (!inv) return false;

  if (inv.signed_at) return true;
  if (inv.signature_at) return true;
  if (inv.signature_date) return true;

  const status = typeof inv.signature_status === "string" ? inv.signature_status.toLowerCase() : "";
  if (status === "signed") return true;

  if (inv.signature_id) return true;
  if (inv.signature_provider) return true;

  if (inv.signed_xml) return true;
  if (inv.signed_teif_xml) return true;
  if (inv.signature_xml) return true;
  if (inv.signature_value) return true;

  if (inv.signature_payload) return true;
  if (inv.signature_result) return true;

  return false;
}

function isTtnLocked(inv: Record<string, any> | null | undefined): boolean {
  if (!inv) return false;

  if (inv.ttn_sent_at) return true;
  if (inv.sent_to_ttn_at) return true;
  if (inv.ttn_submitted_at) return true;

  const st = typeof inv.ttn_status === "string" ? inv.ttn_status.toLowerCase() : "";
  if (!st) return false;

  const allowedToDelete = new Set([
    "draft",
    "not_sent",
    "not_submitted",
    "none",
    "pending",
    "error",
    "failed",
  ]);

  return !allowedToDelete.has(st);
}

function isSignatureBlocking(sig: any | null | undefined): boolean {
  if (!sig) return false;
  const state = typeof sig.state === "string" ? sig.state.toLowerCase() : "";
  if (state === "signed") return true;
  const signedXml = typeof sig.signed_xml === "string" ? sig.signed_xml.trim() : "";
  if (signedXml.length > 0) return true;
  if (sig.signed_at) return true;
  return false;
}

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (invErr) {
    return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  }

  if (!invoice) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const companyId = String((invoice as any).company_id || "");
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "Invoice has no company" }, { status: 400 });
  }

  const allowed = await canCompanyAction(supabase, auth.user.id, companyId, "create_invoices");
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: sig, error: sigErr } = await supabase
    .from("invoice_signatures")
    .select("state,signed_xml,signed_at")
    .eq("invoice_id", id)
    .maybeSingle();

  if (sigErr) {
    return NextResponse.json({ ok: false, error: sigErr.message }, { status: 400 });
  }

  if (isSignatureBlocking(sig) || isInvoiceSignedLegacy(invoice)) {
    return NextResponse.json(
      { ok: false, error: "Invoice is signed and cannot be deleted." },
      { status: 409 }
    );
  }

  if (isTtnLocked(invoice)) {
    return NextResponse.json(
      { ok: false, error: "Invoice is locked by TTN status and cannot be deleted." },
      { status: 409 }
    );
  }

  const { error: delItemsErr } = await supabase.from("invoice_items").delete().eq("invoice_id", id);

  if (delItemsErr) {
    return NextResponse.json({ ok: false, error: delItemsErr.message }, { status: 400 });
  }

  const { error: delInvErr } = await supabase.from("invoices").delete().eq("id", id);

  if (delInvErr) {
    return NextResponse.json({ ok: false, error: delInvErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
