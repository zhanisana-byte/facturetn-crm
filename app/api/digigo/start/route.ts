import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

const MAX_TEIF_BYTES = 50 * 1024;

async function resolveCredForCompany(service: any, company_id: string, env: string) {
  const tryEnv = async (e: string) =>
    service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email, environment")
      .eq("company_id", company_id)
      .eq("environment", e)
      .maybeSingle();

  let r = await tryEnv(env);
  if (r.data) return r;

  r = await tryEnv("production");
  if (r.data) return r;

  return await tryEnv("test");
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();
    const cookieStore = await cookies();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id || body.invoiceId);
    const back_url = s(body.back_url || body.backUrl || body.back);
    const env = s(body.environment || body.env || "test") || "test";

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVALID_INVOICE_ID" }, { status: 400 });
    }

    const inv = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (!inv.data) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const invoice: any = inv.data;
    const company_id = s(invoice.company_id);

    const allowed =
      (await canCompanyAction(supabase, auth.user.id, company_id, "validate_invoices" as any)) ||
      (await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn" as any));

    if (!allowed) {
      return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
    }

    if (!s(invoice.invoice_number)) {
      return NextResponse.json({ ok: false, error: "INVOICE_NUMBER_MISSING" }, { status: 400 });
    }

    if (!invoice.issue_date) {
      return NextResponse.json({ ok: false, error: "ISSUE_DATE_MISSING" }, { status: 400 });
    }

    const items = await service.from("invoice_items").select("*").eq("invoice_id", invoice_id).order("line_no");
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

    const credRes = await resolveCredForCompany(service, company_id, env);
    if (!credRes.data || s((credRes.data as any).signature_provider) !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg =
      (credRes.data as any)?.signature_config && typeof (credRes.data as any).signature_config === "object"
        ? (credRes.data as any).signature_config
        : {};

    const credentialId = s(cfg.digigo_signer_email || cfg.credentialId || cfg.signer_email || (credRes.data as any).cert_email);
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

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
        environment: env,
        meta: { environment: env },
      },
      { onConflict: "invoice_id" }
    );

    await service.from("digigo_sign_sessions").insert({
      state,
      invoice_id,
      company_id,
      created_by: auth.user.id,
      status: "pending",
      back_url: back_url || null,
      environment: env,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    cookieStore.set("digigo_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1800 });
    cookieStore.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1800 });
    cookieStore.set("digigo_back_url", back_url || "/invoices", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 1800 });

    const appUrl = s(process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
    const redirectEnv = s(process.env.DIGIGO_REDIRECT_URI).replace(/\/$/, "");
    const redirectUri = redirectEnv || (appUrl ? `${appUrl}/digigo/redirect` : "");

    if (!redirectUri || !/^https?:\/\//i.test(redirectUri)) {
      return NextResponse.json({ ok: false, error: "REDIRECT_URI_INVALID", value: redirectUri }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: unsigned_hash,
      state,
      redirectUri,
    });

    return NextResponse.json({ ok: true, state, authorize_url });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR", message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
