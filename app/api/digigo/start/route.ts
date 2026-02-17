// app/api/digigo/start/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import { buildTeifInvoiceXml } from "@/lib/ttn/teifXml";
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isHttps(req: Request) {
  try {
    const u = new URL(req.url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function uuid() {
  return crypto.randomUUID();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const svc = createServiceClient();

    const auth = await supabase.auth.getUser();
    if (!auth.data.user) return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoiceId ?? body?.invoice_id ?? body?.id);
    const backUrl = s(body?.backUrl ?? body?.back_url);

    if (!invoice_id) return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });

    const invRes = await svc.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
    if (!invRes.data) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const invoice: any = invRes.data;

    const allowed = await canCompanyAction(supabase, auth.data.user.id, invoice.company_id, "create_invoices" as any);
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const compRes = await svc.from("companies").select("*").eq("id", invoice.company_id).single();
    if (!compRes.data) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const credRes = await svc
      .from("ttn_credentials")
      .select("signature_config, signer_email, updated_at")
      .eq("company_id", invoice.company_id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    const cred = credRes.data?.[0];
    const signatureConfig: any = cred?.signature_config || {};
    const credentialId = s(signatureConfig.digigo_signer_email ?? signatureConfig.credentialId ?? signatureConfig.email ?? cred?.signer_email ?? "");

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const itemsRes = await svc
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("created_at", { ascending: true });

    const items = itemsRes.data || [];

    const xmlRes = await buildTeifInvoiceXml({
      invoice,
      items,
      company: compRes.data as any,
    });

    const unsigned_xml = s(xmlRes?.xml || xmlRes);
    if (!unsigned_xml) return NextResponse.json({ ok: false, error: "XML_BUILD_FAILED" }, { status: 400 });

    const unsigned_hash = sha256Base64Utf8(unsigned_xml);

    const state = uuid();
    const backUrlFinal = backUrl || `/invoices/${invoice_id}`;
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const env = "production";

    const sessIns = await svc
      .from("digigo_sign_sessions")
      .insert({
        invoice_id,
        company_id: invoice.company_id,
        state,
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

    const up = await svc.from("invoice_signatures").upsert({
      invoice_id,
      provider: "digigo",
      state: "pending",
      unsigned_xml,
      unsigned_hash,
      signer_user_id: auth.data.user.id,
      meta: { credentialId, state },
    });

    if (up.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED" }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: unsigned_hash,
      numSignatures: 1,
      state,
    });

    const res = NextResponse.json({ ok: true, authorize_url, state, invoice_id, back_url: backUrlFinal }, { status: 200 });

    const secure = isHttps(req);
    const maxAge = 60 * 30;

    res.cookies.set("digigo_state", state, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_invoice_id", invoice_id, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });
    res.cookies.set("digigo_back_url", backUrlFinal, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "START_FATAL", message: s(e?.message) || "Start fatal" }, { status: 500 });
  }
}
