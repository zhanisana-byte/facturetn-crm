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

function friendlyTeifError(msg: string) {
  const m = s(msg);
  if (!m) return "Données facture incomplètes pour lancer la signature.";
  return m;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body.invoice_id || body.invoiceId);
  if (!invoice_id) return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });

  const envRaw = s(body.environment);
  let environment: "test" | "production" | "" = envRaw === "production" ? "production" : envRaw === "test" ? "test" : "";

  const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoice_id).maybeSingle();
  if (!invoice) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

  const company_id = s((invoice as any)?.company_id);
  if (!company_id) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const allowed = await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn");
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const { data: company } = await supabase.from("companies").select("*").eq("id", company_id).maybeSingle();
  if (!company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

  const service = createServiceClient();

  let cred: any = null;
  let credErr: any = null;

  if (environment) {
    const r = await service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email, environment")
      .eq("company_id", company_id)
      .eq("environment", environment)
      .maybeSingle();
    cred = r.data;
    credErr = r.error;
  } else {
    const rProd = await service
      .from("ttn_credentials")
      .select("signature_provider, signature_config, cert_email, environment")
      .eq("company_id", company_id)
      .eq("environment", "production")
      .maybeSingle();

    if (rProd.error) {
      credErr = rProd.error;
    } else if (rProd.data) {
      cred = rProd.data;
      environment = "production";
    } else {
      const rTest = await service
        .from("ttn_credentials")
        .select("signature_provider, signature_config, cert_email, environment")
        .eq("company_id", company_id)
        .eq("environment", "test")
        .maybeSingle();

      cred = rTest.data;
      credErr = rTest.error;
      if (cred) environment = "test";
    }
  }

  if (credErr) return NextResponse.json({ ok: false, error: "TTN_READ_FAILED", message: credErr.message }, { status: 500 });
  if (!cred) return NextResponse.json({ ok: false, error: "TTN_NOT_CONFIGURED" }, { status: 400 });

  const provider = s((cred as any)?.signature_provider);
  if (provider !== "digigo") {
    return NextResponse.json({ ok: false, error: "TTN_NOT_CONFIGURED", message: "Signature DigiGo non configurée." }, { status: 400 });
  }

  const cfg =
    (cred as any)?.signature_config && typeof (cred as any).signature_config === "object"
      ? (cred as any).signature_config
      : {};

  const credentialId = s(cfg?.digigo_signer_email || (cred as any)?.cert_email || "");
  if (!credentialId) {
    return NextResponse.json(
      { ok: false, error: "EMAIL_DIGIGO_COMPANY_MISSING", message: "Renseignez l’email DigiGo dans Paramètres DigiGo (société)." },
      { status: 400 }
    );
  }

  const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice_id);

  const computed = computeFromItems((items as any[]) || []);
  const stampEnabled = !!((invoice as any).stamp_enabled ?? false);
  const stampAmount = n((invoice as any).stamp_amount ?? 0);

  const ht = n((invoice as any).subtotal_ht ?? computed.ht);
  const tva = n((invoice as any).total_vat ?? computed.tva);
  const ttc = ht + tva + (stampEnabled ? stampAmount : 0);

  let unsigned_xml = "";
  try {
    unsigned_xml = buildTeifInvoiceXml({
      invoiceId: invoice_id,
      company: {
        name: s((company as any)?.company_name ?? ""),
        taxId: s((company as any)?.tax_id ?? (company as any)?.taxId ?? ""),
        address: s((company as any)?.address ?? ""),
        city: s((company as any)?.city ?? ""),
        postalCode: s((company as any)?.postal_code ?? (company as any)?.zip ?? ""),
        country: "TN",
        phone: s((company as any)?.phone ?? ""),
        email: s((company as any)?.email ?? ""),
      },
      customer: {
        name: s((invoice as any)?.customer_name ?? ""),
        taxId: s((invoice as any)?.customer_tax_id ?? ""),
        address: s((invoice as any)?.customer_address ?? ""),
        city: s((invoice as any)?.customer_city ?? ""),
        postalCode: s((invoice as any)?.customer_zip ?? ""),
        country: "TN",
        phone: s((invoice as any)?.customer_phone ?? ""),
        email: s((invoice as any)?.customer_email ?? ""),
      },
      invoice: {
        issueDate: (invoice as any)?.issue_date,
        dueDate: (invoice as any)?.due_date,
        currency: s((invoice as any)?.currency ?? "TND"),
        invoiceNumber: s((invoice as any)?.invoice_number ?? ""),
        documentType: s((invoice as any)?.document_type ?? "facture"),
        subtotalHT: ht,
        totalTVA: tva,
        stampEnabled,
        stampAmount,
        totalTTC: ttc,
        notes: s((invoice as any)?.notes ?? ""),
      },
      items: (items as any[]) || [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "TEIF_BUILD_FAILED", message: friendlyTeifError(e?.message || String(e)) }, { status: 400 });
  }

  const unsigned_hash = sha256Base64Utf8(unsigned_xml);
  const nonce = crypto.randomBytes(16).toString("hex");
  const stateStr = `${invoice_id}.${nonce}`;

  let authorize_url = "";
  try {
    authorize_url = digigoAuthorizeUrl({
      credentialId,
      hashBase64: unsigned_hash,
      numSignatures: 1,
      state: stateStr,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "DIGIGO_AUTHORIZE_URL_FAILED", message: s(e?.message || e) }, { status: 500 });
  }

  const payload: any = {
    invoice_id,
    provider: "digigo",
    state: "pending_auth",
    unsigned_xml,
    unsigned_hash,
    signed_xml: "",
    signed_hash: "",
    company_id,
    environment: environment || "test",
    signer_user_id: auth.user.id,
    meta: {
      state: stateStr,
      credentialId,
      hashAlgo: "SHA256",
      signAlgo: "RS256",
    },
  };

  const { error: upsertError } = await service
    .from("invoice_signatures")
    .upsert(payload as any, { onConflict: "invoice_id" });

  if (upsertError) {
    return NextResponse.json(
      { ok: false, error: "SIGNATURE_CONTEXT_INSERT_FAILED", message: upsertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, url: authorize_url, state: stateStr });
}
