import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAuthorizeUrl } from "@/lib/digigo/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function POST(req: Request) {
  const service = createServiceClient();

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id || body?.invoiceId || "");
    const back_url = s(body?.back_url || body?.backUrl || body?.back || "");

    if (!invoice_id || !isUuid(invoice_id)) {
      return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });
    }

    const invRes = await service
      .from("invoices")
      .select("company_id, environment")
      .eq("id", invoice_id)
      .maybeSingle();

    const company_id = s(invRes.data?.company_id || "");
    const environment = s(invRes.data?.environment || body?.environment || "test") || "test";

    if (!company_id) {
      return NextResponse.json({ ok: false, error: "COMPANY_ID_MISSING" }, { status: 400 });
    }

    const sigRes = await service
      .from("invoice_signatures")
      .select("unsigned_hash, meta")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    const unsigned_hash = s(sigRes.data?.unsigned_hash || "");
    const meta: any = sigRes.data?.meta && typeof sigRes.data.meta === "object" ? sigRes.data.meta : {};

    if (!unsigned_hash) {
      return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });
    }

    const credRes = await service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email")
      .eq("company_id", company_id)
      .eq("environment", environment)
      .maybeSingle();

    const provider = s((credRes.data as any)?.signature_provider || "");
    if (provider !== "digigo") {
      return NextResponse.json({ ok: false, error: "DIGIGO_NOT_CONFIGURED" }, { status: 400 });
    }

    const cfg =
      (credRes.data as any)?.signature_config && typeof (credRes.data as any).signature_config === "object"
        ? (credRes.data as any).signature_config
        : {};

    const credentialId = s(
      meta?.credentialId ||
        meta?.digigo?.credentialId ||
        cfg?.digigo_signer_email ||
        cfg?.credentialId ||
        cfg?.signer_email ||
        (credRes.data as any)?.cert_email
    );

    if (!credentialId) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_ID_MISSING" }, { status: 400 });
    }

    const state = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await service.from("digigo_sign_sessions").insert({
      invoice_id,
      company_id,
      environment,
      state,
      status: "pending",
      created_by: user.id,
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const jar = await cookies();
    const secure = true;

    jar.set("digigo_state", state, { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: 60 * 15 });
    jar.set("digigo_invoice_id", invoice_id, { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: 60 * 15 });
    jar.set("digigo_back_url", back_url || "", { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: 60 * 15 });

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/digigo/redirect`;

    const authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: unsigned_hash,
      redirectUri,
      numSignatures: 1,
      state,
    });

    return NextResponse.json({ ok: true, authorize_url, state }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", message: s(e?.message || e) }, { status: 500 });
  }
}
