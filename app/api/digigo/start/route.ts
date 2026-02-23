import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { digigoAuthorizeUrl } from "@/lib/digigo/client";
import { sha256Base64 } from "@/lib/crypto/sha256";
import { teifFromInvoiceId } from "@/lib/ttn/teif";
import { randomUUID } from "crypto";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body.invoice_id);
  const credentialIdFromBody = s(body.credentialId);
  const back_url = s(body.back_url) || (invoice_id ? `/invoices/${invoice_id}` : "");

  if (!invoice_id) return NextResponse.json({ error: "MISSING_INVOICE_ID" }, { status: 400 });

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { data: inv, error: invErr } = await admin
    .from("invoices")
    .select("id, company_id")
    .eq("id", invoice_id)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const { data: sigExisting } = await admin
    .from("invoice_signatures")
    .select("id, unsigned_xml, unsigned_hash, meta")
    .eq("invoice_id", invoice_id)
    .eq("provider", "digigo")
    .eq("environment", "production")
    .maybeSingle();

  let unsigned_xml = s(sigExisting?.unsigned_xml);
  if (!unsigned_xml) unsigned_xml = await teifFromInvoiceId(invoice_id);

  const unsigned_hash = s(sigExisting?.unsigned_hash) || sha256Base64(unsigned_xml);

  const credentialId =
    credentialIdFromBody ||
    s((sigExisting?.meta as any)?.credentialId) ||
    s((sigExisting?.meta as any)?.digigoCredentialId) ||
    s((sigExisting?.meta as any)?.digigo_email);

  if (!credentialId) return NextResponse.json({ error: "MISSING_CREDENTIAL_ID" }, { status: 400 });

  const meta = {
    ...(typeof sigExisting?.meta === "object" && sigExisting?.meta ? (sigExisting.meta as any) : {}),
    credentialId,
    back_url,
  };

  const { error: upErr } = await admin.from("invoice_signatures").upsert({
    id: sigExisting?.id,
    invoice_id,
    provider: "digigo",
    state: "pending",
    unsigned_xml,
    unsigned_hash,
    signed_xml: null,
    signed_hash: null,
    signed_at: null,
    error_message: null,
    company_id: inv.company_id,
    environment: "production",
    signer_user_id: user.id,
    meta,
    updated_at: new Date().toISOString(),
  });

  if (upErr) return NextResponse.json({ error: "SIGNATURE_UPSERT_FAILED", details: upErr.message }, { status: 500 });

  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await admin.from("digigo_sign_sessions").insert({
    invoice_id,
    state: randomUUID(),
    back_url,
    status: "pending",
    created_by: user.id,
    company_id: inv.company_id,
    environment: "production",
    expires_at,
  });

  const url = digigoAuthorizeUrl({ credentialId, hash: unsigned_hash });
  return NextResponse.json({ ok: true, url });
}
