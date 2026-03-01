import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import { buildTeifInvoiceXml } from "@/lib/ttn/teifXml";
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo/client";
import { pickCompanyDigigoEnv, resolveCredentialId } from "@/lib/digigo/config";

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function isHttps(req: Request) {
  const proto = s(req.headers.get("x-forwarded-proto") || "");
  if (proto) return proto === "https";
  return true;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const svc = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body.invoice_id ?? body.invoiceId);
    const back_url = s(body.back_url ?? body.backUrl);

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "BAD_INVOICE_ID" }, { status: 400 });
    }

    const invRes = await svc.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
    if (!invRes.data) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const invoice: any = invRes.data;
    const company_id = s(invoice.company_id);
    if (!company_id || !isUuid(company_id)) {
      return NextResponse.json({ ok: false, error: "BAD_COMPANY_ID" }, { status: 400 });
    }

    const allowed =
      (await canCompanyAction(supabase, user.id, company_id, "validate_invoices" as any)) ||
      (await canCompanyAction(supabase, user.id, company_id, "submit_ttn" as any)) ||
      (await canCompanyAction(supabase, user.id, company_id, "create_invoices" as any));

    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const compRes = await svc.from("companies").select("*").eq("id", company_id).maybeSingle();
    if (!compRes.data) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });
    const company: any = compRes.data;

    const env = await pickCompanyDigigoEnv(company_id, req.headers.get("host"));

    const ttnRes = await svc
      .from("ttn_credentials")
      .select("*")
      .eq("company_id", company_id)
      .eq("environment", env)
      .eq("is_active", true)
      .maybeSingle();

    const ttn = ttnRes.data;
    if (!ttn || s(ttn.signature_provider) !== "digigo" || ttn.require_signature !== true) {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED", env }, { status: 400 });
    }

    const credentialId = resolveCredentialId(company, ttn);
    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_CREDENTIAL_INVALID", env }, { status: 400 });
    }

    const itemsRes = await svc.from("invoice_items").select("*").eq("invoice_id", invoice_id).order("line_no", { ascending: true });
    const items: any[] = itemsRes.data || [];
    if (!items.length) return NextResponse.json({ ok: false, error: "NO_ITEMS" }, { status: 400 });

    const stampEnabled = Boolean(invoice?.stamp_enabled ?? false);
    const stampAmount = stampEnabled ? n(invoice?.stamp_amount ?? 0) : 0;

    const unsigned_xml = buildTeifInvoiceXml({
      invoiceId: invoice_id,
      invoice,
      company,
      items,
      totals: {
        ht: n(invoice?.subtotal_ht ?? 0),
        tva: n(invoice?.total_vat ?? 0),
        ttc: n(invoice?.total_ttc ?? 0),
        stampEnabled,
        stampAmount,
      },
    } as any);

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);
    const state = crypto.randomUUID();
    const backUrlFinal = back_url || `/invoices/${invoice_id}`;
    const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const sessIns = await svc
      .from("digigo_sign_sessions")
      .insert({
        state,
        invoice_id,
        company_id,
        created_by: user.id,
        back_url: backUrlFinal,
        status: "pending",
        expires_at,
        environment: env,
      })
      .select("id")
      .maybeSingle();

    if (sessIns.error) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED", details: sessIns.error.message }, { status: 500 });
    }

    const up = await svc.from("invoice_signatures").upsert(
      {
        invoice_id,
        company_id,
        environment: env,
        provider: "digigo",
        state: "pending",
        unsigned_xml,
        unsigned_hash,
        signer_user_id: user.id,
        meta: { credentialId, state, back_url: backUrlFinal },
      },
      { onConflict: "invoice_id" }
    );

    if (up.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED", details: up.error.message }, { status: 500 });
    }

    const clientId = s(process.env.DIGIGO_CLIENT_ID);
    const redirectUri = s(process.env.DIGIGO_REDIRECT_URI);
    if (!clientId || !redirectUri) {
      return NextResponse.json({ ok: false, error: "MISSING_DIGIGO_ENV_VARS", env }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      env,
      clientId,
      redirectUri,
      credentialId,
      hashBase64: unsigned_hash,
      numSignatures: 1,
      state,
    });

    const res = NextResponse.json({ ok: true, authorize_url, state, env }, { status: 200 });

    const secure = isHttps(req);
    const maxAge = 60 * 30;
    res.cookies.set("digigo_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_back_url", backUrlFinal, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "START_FAILED", details: String(e?.message || e) }, { status: 500 });
  }
}
