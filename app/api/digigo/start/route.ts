// app/api/digigo/start/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { digigoAuthorizeUrl, sha256Base64Utf8 } from "@/lib/digigo/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

function safeBackUrl(v: any, fallback: string) {
  const raw = s(v);
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

export async function POST(req: Request) {
  try {
    const service = createServiceClient();
    const body = await req.json().catch(() => ({}));

    const invoice_id = s(body?.invoice_id);
    if (!invoice_id) return NextResponse.json({ ok: false, error: "INVOICE_ID_MISSING" }, { status: 400 });

    const inv = await service.from("invoices").select("id, company_id").eq("id", invoice_id).maybeSingle();
    if (!inv.data?.id) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const back_url = safeBackUrl(body?.back_url, `/invoices/${invoice_id}`);

    const sigRow = await service
      .from("invoice_signatures")
      .select("unsigned_xml, unsigned_hash, meta")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    const unsigned_xml = s(sigRow.data?.unsigned_xml);
    let unsigned_hash = s(sigRow.data?.unsigned_hash);
    if (!unsigned_hash && unsigned_xml) unsigned_hash = sha256Base64Utf8(unsigned_xml);
    if (!unsigned_hash) return NextResponse.json({ ok: false, error: "UNSIGNED_HASH_MISSING" }, { status: 400 });

    const cred = await service
      .from("ttn_credentials")
      .select("signature_config")
      .eq("company_id", inv.data.company_id)
      .eq("environment", "production")
      .maybeSingle();

    const cfg = cred.data?.signature_config && typeof cred.data.signature_config === "object" ? cred.data.signature_config : {};
    const credentialId = s(cfg?.digigo_signer_email || cfg?.credentialId || cfg?.email);
    if (!credentialId) return NextResponse.json({ ok: false, error: "DIGIGO_SIGNER_EMAIL_NOT_CONFIGURED" }, { status: 400 });

    const state = crypto.randomUUID();
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 60 * 1000);

    const upSig = await service.from("invoice_signatures").upsert(
      {
        invoice_id,
        provider: "digigo",
        state: "pending",
        unsigned_xml: unsigned_xml || null,
        unsigned_hash,
        company_id: inv.data.company_id,
        environment: "production",
        meta: { ...(sigRow.data?.meta || {}), state, credentialId },
        updated_at: now.toISOString(),
      },
      { onConflict: "invoice_id" }
    );

    if (upSig.error) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPSERT_FAILED", message: upSig.error.message }, { status: 500 });
    }

    const insSession = await service.from("digigo_sign_sessions").insert({
      invoice_id,
      company_id: inv.data.company_id,
      environment: "production",
      state,
      status: "pending",
      back_url,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expires.toISOString(),
    });

    if (insSession.error) {
      return NextResponse.json({ ok: false, error: "SESSION_INSERT_FAILED", message: insSession.error.message }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      state,
      hash: unsigned_hash,
      credentialId,
      numSignatures: 1,
    });

    return NextResponse.json({ ok: true, authorize_url, state, invoice_id, back_url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "START_FAILED", message: String(e?.message || e) }, { status: 500 });
  }
}
