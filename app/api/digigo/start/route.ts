import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { buildTeifInvoiceXml } from "@/lib/ttn/teif";
import { digigoAuthorizeUrl } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function sha256Base64Utf8(input: string) {
  return crypto.createHash("sha256").update(input, "utf8").digest("base64");
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const body = await req.json().catch(() => ({}));

    const invoice_id = s(body.invoice_id || body.invoiceId || "");
    const company_id = s(body.company_id || body.companyId || "");
    const back_url = s(body.back_url || body.backUrl || body.back || "") || "/app";

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }
    if (!company_id || !isUuid(company_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_COMPANY_ID" }, { status: 400 });
    }

    const supabase = await createClient();
    const userRes = await supabase.auth.getUser();
    const user = userRes.data?.user;
    if (!user?.id) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    // Permission simple (à adapter selon ta logique)
    const service = createServiceClient();
    const mem = await service
      .from("memberships")
      .select("id, role, can_create_invoices, can_validate_invoices, can_submit_ttn")
      .eq("company_id", company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    const allowed =
      !!mem.data?.id &&
      (mem.data.role === "owner" ||
        mem.data.role === "admin" ||
        mem.data.can_create_invoices ||
        mem.data.can_validate_invoices ||
        mem.data.can_submit_ttn);

    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const invRes = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (!invRes.data) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const invoice: any = invRes.data;

    const compRes = await service.from("companies").select("*").eq("id", company_id).single();
    if (!compRes.data) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const env = s(body.environment || body.env || "") || "test";

    const credRes = await service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email, environment")
      .eq("company_id", company_id)
      .eq("environment", env)
      .maybeSingle();

    if (!credRes.data || (credRes.data as any).signature_provider !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg =
      (credRes.data as any)?.signature_config && typeof (credRes.data as any).signature_config === "object"
        ? (credRes.data as any).signature_config
        : {};

    // Résolution robuste pour éviter CREDENTIAL_ID_MISSING
    // Priorité:
    // 1) signature_config.digigo_signer_email
    // 2) signature_config.credentialId
    // 3) signature_config.signer_email
    // 4) ttn_credentials.cert_email
    const credentialId = s(
      cfg.digigo_signer_email || cfg.credentialId || cfg.signer_email || (credRes.data as any).cert_email
    );
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

    const itemsRes = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("line_no");

    if (!itemsRes.data || itemsRes.data.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_ITEMS" }, { status: 400 });
    }

    const unsigned_xml = buildTeifInvoiceXml({
      invoiceId: invoice_id,
      company: {
        name: s((compRes.data as any).company_name),
        taxId: s((compRes.data as any).tax_id),
        address: s((compRes.data as any).address),
        city: s((compRes.data as any).city),
        postalCode: s((compRes.data as any).postal_code),
        country: "TN",
      },
      invoice: {
        documentType: invoice.document_type,
        number: invoice.invoice_number,
        issueDate: invoice.issue_date,
        currency: invoice.currency || "TND",
        customerName: invoice.customer_name,
        customerTaxId: invoice.customer_tax_id,
        subtotalHt: invoice.subtotal_ht,
        totalVat: invoice.total_vat,
        stampEnabled: !!invoice.stamp_enabled,
        stampAmount: invoice.stamp_amount,
        totalTtc: invoice.total_ttc,
      },
      items: itemsRes.data as any[],
    });

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);

    await service
      .from("invoice_signatures")
      .upsert(
        {
          invoice_id,
          company_id,
          provider: "digigo",
          state: "pending",
          unsigned_xml,
          unsigned_hash,
          environment: env,
          signer_user_id: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "invoice_id" }
      );

    const sessionRes = await service
      .from("digigo_sign_sessions")
      .insert({
        state: crypto.randomUUID(),
        invoice_id,
        company_id,
        created_by: user.id,
        back_url,
        status: "pending",
        environment: env,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (!sessionRes.data?.state) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    // Cookies fallback (top-level redirect DigiGo -> Vercel peut parfois perdre ces infos)
    cookieStore.set("digigo_state", String(sessionRes.data.state), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 30 * 60,
    });
    cookieStore.set("digigo_invoice_id", String(invoice_id), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 30 * 60,
    });
    cookieStore.set("digigo_back_url", String(back_url), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 30 * 60,
    });

    const authorizeUrl = digigoAuthorizeUrl({
      credentialId,
      numSignatures: 1,
      hashes: [unsigned_hash],
    });

    return NextResponse.json(
      {
        ok: true,
        authorizeUrl,
        state: sessionRes.data.state,
        invoice_id,
        company_id,
        environment: env,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
