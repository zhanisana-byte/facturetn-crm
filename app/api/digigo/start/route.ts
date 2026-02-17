// app/api/digigo/start/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { digigoAuthorizeUrl, type DigigoEnv } from "@/lib/digigo";
import crypto from "crypto";

function uuid() {
  return crypto.randomUUID();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json().catch(() => ({}));
    const invoiceId = String(body?.invoiceId || "");
    const backUrl = body?.backUrl ? String(body.backUrl) : null;

    if (!invoiceId) {
      return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });
    }

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, company_id, signature_provider, signature_status")
      .eq("id", invoiceId)
      .single();

    if (invErr || !inv) {
      return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
    }

    const { data: cred, error: credErr } = await supabase
      .from("ttn_credentials")
      .select("company_id, environment, is_active, credential_from_db")
      .eq("company_id", inv.company_id)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (credErr || !cred?.credential_from_db) {
      return NextResponse.json({ ok: false, error: "CREDENTIAL_NOT_FOUND" }, { status: 400 });
    }

    const environment = (cred.environment || "production") as DigigoEnv;
    const credentialId = String(cred.credential_from_db);

    const { data: sig, error: sigErr } = await supabase
      .from("invoice_signatures")
      .select("id, invoice_id, environment, unsigned_hash, unsigned_xml, meta")
      .eq("invoice_id", invoiceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sigErr || !sig?.unsigned_hash) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_ROW_MISSING_OR_NO_HASH" }, { status: 400 });
    }

    const state = uuid();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: sessErr } = await supabase.from("digigo_sign_sessions").insert({
      invoice_id: invoiceId,
      state,
      back_url: backUrl ?? `/invoices/${invoiceId}`,
      status: "pending",
      company_id: inv.company_id,
      environment,
      expires_at: expiresAt,
    });

    if (sessErr) {
      return NextResponse.json({ ok: false, error: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    const meta = {
      ...(sig.meta || {}),
      state,
      environment,
      credentialId,
    };

    const { error: upSigErr } = await supabase
      .from("invoice_signatures")
      .update({ environment, meta })
      .eq("invoice_id", invoiceId);

    if (upSigErr) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_UPDATE_FAILED" }, { status: 500 });
    }

    const authorize_url = digigoAuthorizeUrl({
      environment,
      credentialId,
      state,
      hash: String(sig.unsigned_hash),
      numSignatures: 1,
    });

    return NextResponse.json({ ok: true, authorize_url });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "START_FATAL" }, { status: 500 });
  }
}
