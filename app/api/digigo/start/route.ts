import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { digigoAuthorizeUrl } from "@/lib/digigo/client";
import { sha256Base64Utf8 } from "@/lib/crypto/sha256";
import { buildTeifInvoiceXml } from "@/lib/ttn/teifXml";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function clampPct(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}

function computeFromItems(items: any[]) {
  let ht = 0;
  let tva = 0;

  for (const it of items) {
    const qty = n(it.quantity ?? it.qty ?? 0);
    const pu = n(it.unit_price_ht ?? it.unit_price ?? it.price ?? 0);
    const vatPct = n(it.vat_pct ?? it.vatPct ?? it.tva_pct ?? it.tvaPct ?? it.vat ?? 0);
    const discPct = clampPct(n(it.discount_pct ?? it.discountPct ?? it.remise_pct ?? it.remisePct ?? it.discount ?? 0));
    const discAmt = n(it.discount_amount ?? it.discountAmount ?? it.remise_amount ?? it.remiseAmount ?? 0);

    const base = qty * pu;
    const remise = discAmt > 0 ? discAmt : discPct > 0 ? (base * discPct) / 100 : 0;
    const lineHt = Math.max(0, base - remise);
    const lineTva = (lineHt * vatPct) / 100;

    ht += lineHt;
    tva += lineTva;
  }

  return { ht, tva };
}

async function getUserIdOrThrow() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) throw new Error("UNAUTHORIZED");
  return user.id;
}

export async function POST(req: Request) {
  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}));

    const invoiceId = s(body?.invoice_id);
    const credentialId = s(body?.credential_id);
    const backUrl = s(body?.back_url);

    if (!invoiceId) return NextResponse.json({ error: "MISSING_INVOICE_ID" }, { status: 400 });
    if (!credentialId) return NextResponse.json({ error: "MISSING_CREDENTIAL_ID" }, { status: 400 });

    const signerUserId = await getUserIdOrThrow();

    const { data: invoice, error: eInv } = await admin.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
    if (eInv || !invoice) return NextResponse.json({ error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const companyId = s((invoice as any).company_id);
    if (!companyId) return NextResponse.json({ error: "MISSING_COMPANY_ID" }, { status: 400 });

    const { data: company, error: eC } = await admin.from("companies").select("*").eq("id", companyId).maybeSingle();
    if (eC || !company) return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });

    const { data: items, error: eItems } = await admin
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("position", { ascending: true });

    if (eItems) return NextResponse.json({ error: "ITEMS_LOAD_FAILED", details: eItems.message }, { status: 500 });

    const safeItems = Array.isArray(items) ? items : [];
    const computed = computeFromItems(safeItems);

    const ht = computed.ht;
    const tva = computed.tva;

    const stampEnabled = Boolean((invoice as any).stamp_enabled ?? false);
    const stampAmount = n((invoice as any).stamp_amount ?? 0);

    const ttc = ht + tva + (stampEnabled ? stampAmount : 0);

    const unsignedXml = buildTeifInvoiceXml({
      invoiceId,
      company: {
        name: s((company as any).company_name ?? (company as any).name ?? "Société"),
        taxId: s((company as any).tax_id ?? "NA"),
        address: s((company as any).address ?? ""),
        city: s((company as any).city ?? ""),
        postalCode: s((company as any).postal_code ?? ""),
        country: s((company as any).country ?? "TN"),
      },
      invoice: {
        documentType: s((invoice as any).document_type ?? "facture"),
        number: s((invoice as any).invoice_number ?? ""),
        issueDate: s((invoice as any).issue_date ?? ""),
        dueDate: s((invoice as any).due_date ?? ""),
        currency: s((invoice as any).currency ?? "TND"),
        customerName: s((invoice as any).customer_name ?? "Client"),
        customerTaxId: s((invoice as any).customer_tax_id ?? "NA"),
        customerAddress: s((invoice as any).customer_address ?? ""),
        notes: s((invoice as any).notes ?? ""),
      },
      totals: { ht, tva, ttc, stampEnabled, stampAmount },
      items: safeItems.map((it: any) => ({
        description: s(it.description ?? "Item"),
        qty: n(it.quantity ?? 1),
        price: n(it.unit_price_ht ?? 0),
        vat: n(it.vat_pct ?? 0),
        discount: n(it.discount_pct ?? 0),
      })),
      purpose: "preview",
    });

    const unsignedHash = sha256Base64Utf8(unsignedXml);

    const state = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

    const { error: upsertErr } = await admin.from("invoice_signatures").upsert(
      {
        invoice_id: invoiceId,
        provider: "digigo",
        state: "pending",
        unsigned_xml: unsignedXml,
        unsigned_hash: unsignedHash,
        signed_xml: null,
        signed_at: null,
        session_id: null,
        otp_id: null,
        error_message: null,
        company_id: companyId,
        environment: "production",
        signer_user_id: signerUserId,
        meta: { state, back_url: backUrl || `/invoices/${invoiceId}`, credentialId },
        signed_hash: null,
        updated_at: now.toISOString(),
      },
      { onConflict: "invoice_id" }
    );

    if (upsertErr) return NextResponse.json({ error: "SIGNATURE_UPSERT_FAILED", details: upsertErr.message }, { status: 500 });

    const { error: sessErr } = await admin.from("digigo_sign_sessions").insert({
      invoice_id: invoiceId,
      state,
      back_url: backUrl || `/invoices/${invoiceId}`,
      status: "pending",
      created_by: signerUserId,
      company_id: companyId,
      environment: "production",
      expires_at: expiresAt.toISOString(),
      digigo_jti: null,
      error_message: null,
      updated_at: now.toISOString(),
    });

    if (sessErr) return NextResponse.json({ error: "SESSION_CREATE_FAILED", details: sessErr.message }, { status: 500 });

    const authorizeUrl = digigoAuthorizeUrl({
      state,
      credentialId,
      hashBase64: unsignedHash,
    });

    return NextResponse.json({ authorize_url: authorizeUrl });
  } catch (e: any) {
    return NextResponse.json({ error: "START_FAILED", details: String(e?.message || e) }, { status: 500 });
  }
}
