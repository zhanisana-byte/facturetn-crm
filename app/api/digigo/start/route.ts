import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import { buildTeifInvoiceXml } from "@/lib/ttn/teifXml";
import { sha256Base64Utf8, digigoAuthorizeUrl } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function isUuid(v: string) {
  return /^[0-9a-f-]{36}$/i.test(v);
}

const MAX_TEIF_BYTES = 50 * 1024;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id);

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const inv = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (!inv.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const invoice: any = inv.data;
    const company_id = invoice.company_id;

    const allowed =
      (await canCompanyAction(supabase, auth.user.id, company_id, "validate_invoices" as any)) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn" as any));

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    const items = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("line_no");

    if (!items.data || items.data.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_ITEMS" }, { status: 400 });
    }

    const unsigned_xml = buildTeifInvoiceXml({
      invoiceId: invoice_id,
      invoice,
      items: items.data,
      purpose: "ttn",
    } as any);

    if (Buffer.byteLength(unsigned_xml, "utf8") > MAX_TEIF_BYTES) {
      return NextResponse.json({ ok: false, error: "TEIF_XML_TOO_LARGE" }, { status: 400 });
    }

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);

    const state = crypto.randomUUID();

    await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        provider: "digigo",
        state: "pending",
        unsigned_xml,
        unsigned_hash,
        signer_user_id: auth.user.id,
      },
      { onConflict: "invoice_id" }
    );

    await service.from("digigo_sign_sessions").insert({
      state,
      invoice_id,
      company_id,
      created_by: auth.user.id,
      status: "pending",
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    const appUrl = s(process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
    const redirectUri = `${appUrl}/digigo/redirect/${state}`;

    const authorize_url = digigoAuthorizeUrl({
      credentialId: invoice.customer_email,
      hashBase64: unsigned_hash,
      state,
      redirectUri,
    });

    return NextResponse.json({ ok: true, authorize_url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
