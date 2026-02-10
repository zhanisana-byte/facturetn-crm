import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const invoiceId = s(id);
  if (!invoiceId) return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id,company_id,signature_status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 500 });
  if (!invoice) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const companyId = s((invoice as any).company_id);
  const invoiceSigStatus = s((invoice as any).signature_status).toLowerCase();

  const service = createServiceClient();

  const { data: sig, error: sigErr } = await service
    .from("invoice_signatures")
    .select("signed_xml,state,signed_at,provider")
    .eq("invoice_id", invoiceId)
    .maybeSingle();

  if (sigErr) return NextResponse.json({ ok: false, error: sigErr.message }, { status: 500 });

  const state = s((sig as any)?.state).toLowerCase();
  const signedXml = s((sig as any)?.signed_xml);

  if (!sig) {
    return NextResponse.json(
      {
        ok: false,
        error: "NOT_SIGNED",
        details: {
          reason: "NO_SIGNATURE_ROW",
          invoice_signature_status: invoiceSigStatus,
          company_id: companyId,
        },
      },
      { status: 409 }
    );
  }

  if (state !== "signed" || !signedXml) {
    return NextResponse.json(
      {
        ok: false,
        error: "NOT_SIGNED",
        details: {
          reason: !signedXml ? "SIGNED_XML_EMPTY" : "STATE_NOT_SIGNED",
          invoice_signature_status: invoiceSigStatus,
          signature_state: state || null,
          has_signed_xml: !!signedXml,
          signed_at: (sig as any)?.signed_at ?? null,
          provider: (sig as any)?.provider ?? null,
        },
      },
      { status: 409 }
    );
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
