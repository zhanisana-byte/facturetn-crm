import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getSignaturePolicy(supabase: any, companyId: string) {
  const { data: cred } = await supabase
    .from("ttn_credentials")
    .select("signature_provider,require_signature")
    .eq("company_id", companyId)
    .eq("environment", "production")
    .maybeSingle();

  const provider = String((cred as any)?.signature_provider ?? "none");
  const required = Boolean((cred as any)?.require_signature) || provider !== "none";
  return { required, provider };
}

async function hasSignedXml(supabase: any, invoiceId: string) {
  const { data: sig } = await supabase
    .from("invoice_signatures")
    .select("signed_xml")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  return sig?.signed_xml ? true : false;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const body = await req.json().catch(() => ({}));
    const scheduledAtRaw = String(body?.scheduled_at || body?.send_at || "").trim();
    const scheduled_at = scheduledAtRaw ? new Date(scheduledAtRaw) : new Date(Date.now() + 10 * 60 * 1000);

    if (Number.isNaN(scheduled_at.getTime())) {
      return NextResponse.json({ ok: false, error: "DATE_INVALID" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id,company_id,document_type,ttn_status,require_accountant_validation,accountant_validated_at")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ ok: false, error: invErr?.message || "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const companyId = String((invoice as any).company_id || "");
    if (!companyId) return NextResponse.json({ ok: false, error: "COMPANY_ID_MISSING" }, { status: 400 });

    const docType = String((invoice as any).document_type ?? "facture").toLowerCase();
    if (docType === "devis") {
      return NextResponse.json({ ok: false, error: "DEVIS_NOT_SENDABLE_TTN" }, { status: 400 });
    }

    const ttnStatus = String((invoice as any).ttn_status || "not_sent");
    if (ttnStatus !== "not_sent") {
      return NextResponse.json({ ok: false, error: "INVOICE_LOCKED_TTN" }, { status: 409 });
    }

    const allowed = await canCompanyAction(supabase, auth.user.id, companyId, "submit_ttn");
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    if ((invoice as any).require_accountant_validation && !(invoice as any).accountant_validated_at) {
      return NextResponse.json({ ok: false, error: "VALIDATION_REQUIRED" }, { status: 409 });
    }

    const sigPolicy = await getSignaturePolicy(supabase, companyId);
    if (sigPolicy.required) {
      const okSigned = await hasSignedXml(supabase, id);
      if (!okSigned) return NextResponse.json({ ok: false, error: "SIGNATURE_REQUIRED" }, { status: 409 });
    }

    const { error: qErr } = await supabase.from("ttn_invoice_queue").upsert(
      {
        invoice_id: invoice.id,
        company_id: companyId,
        scheduled_at: scheduled_at.toISOString(),
        status: "scheduled",
        last_error: null,
        created_by: auth.user.id,
      },
      { onConflict: "invoice_id" }
    );

    if (qErr) return NextResponse.json({ ok: false, error: qErr.message }, { status: 500 });

    const { error: upErr } = await supabase
      .from("invoices")
      .update({ ttn_status: "scheduled", ttn_scheduled_at: scheduled_at.toISOString() })
      .eq("id", invoice.id);

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    await supabase.from("notifications").insert({
      user_id: auth.user.id,
      type: "ttn_scheduled",
      title: "Envoi TTN programmé",
      message: `Facture ${invoice.id} programmée pour ${scheduled_at.toISOString()}`,
      is_read: false,
    });

    return NextResponse.json({ ok: true, scheduled_at: scheduled_at.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "SERVER_ERROR" }, { status: 500 });
  }
}
