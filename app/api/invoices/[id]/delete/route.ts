import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function s(v: any) {
  return String(v ?? "").trim();
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

function isTtnLocked(inv: Record<string, any> | null | undefined): boolean {
  if (!inv) return false;
  const st = s(inv.ttn_status || "").toLowerCase();
  if (!st) return false;
  const allowed = new Set(["draft", "not_sent", "not_submitted", "none", "pending", "error", "failed", "scheduled"]);
  return !allowed.has(st);
}

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const invoiceId = s(id);
  if (!invoiceId) return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });

  const { data: invoice, error: invErr } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  if (!invoice) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const companyId = s((invoice as any).company_id);
  if (!companyId) return NextResponse.json({ ok: false, error: "INVOICE_NO_COMPANY" }, { status: 400 });

  const allowed = await canCompanyAction(supabase, auth.user.id, companyId, "create_invoices");
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const service = createServiceClient();

  const { data: sig, error: sigErr } = await service
    .from("invoice_signatures")
    .select("state,signed_xml,signed_at")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (sigErr) return NextResponse.json({ ok: false, error: sigErr.message }, { status: 400 });

  if (isSignatureBlocking(sig) || s((invoice as any).signature_status).toLowerCase() === "signed") {
    return NextResponse.json({ ok: false, error: "Invoice is signed and cannot be deleted." }, { status: 409 });
  }

  if (isTtnLocked(invoice as any)) {
    return NextResponse.json({ ok: false, error: "Invoice is locked by TTN status and cannot be deleted." }, { status: 409 });
  }

  const { error: delItemsErr } = await service.from("invoice_items").delete().eq("invoice_id", invoiceId);
  if (delItemsErr) return NextResponse.json({ ok: false, error: delItemsErr.message }, { status: 400 });

  await service.from("invoice_signatures").delete().eq("invoice_id", invoiceId);

  const { error: delInvErr } = await service.from("invoices").delete().eq("id", invoiceId);
  if (delInvErr) return NextResponse.json({ ok: false, error: delInvErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
