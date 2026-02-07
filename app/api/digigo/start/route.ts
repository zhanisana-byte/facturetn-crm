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

    ht += lineHt;
    tva += (lineHt * vatPct) / 100;
  }

  const ttc = ht + tva;
  return { ht, tva, ttc };
}

function friendlyTeifError(msg: string) {
  const m = s(msg);
  if (!m) return "Erreur TEIF.";
  if (m.toLowerCase().includes("max size")) return "TEIF trop volumineux.";
  if (m.toLowerCase().includes("minimum")) return "TEIF incomplet (champs obligatoires manquants).";
  return m;
}

async function canSignInvoice(supabase: any, userId: string, companyId: string) {
  const a = await canCompanyAction(supabase, userId, companyId, "validate_invoices");
  if (a) return true;
  const b = await canCompanyAction(supabase, userId, companyId, "submit_ttn");
  if (b) return true;
  const c = await canCompanyAction(supabase, userId, companyId, "create_invoices");
  return c;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const service = createServiceClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invoice_id = s(body?.invoice_id);
    let environment = s(body?.environment);

    if (!invoice_id) return NextResponse.json({ ok: false, error: "MISSING_INVOICE_ID" }, { status: 400 });

    const { data: invoice, error: iErr } = await service.from("invoices").select("*").eq("id", invoice_id).single();
    if (iErr || !invoice) return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });

    const company_id = s((invoice as any)?.company_id);
    if (!company_id) return NextResponse.json({ ok: false, error: "INVOICE_NO_COMPANY" }, { status: 400 });

    const allowed = await canSignInvoice(supabase, auth.user.id, company_id);
    if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    const { data: company, error: cErr } = await service.from("companies").select("*").eq("id", company_id).single();
    if (cErr || !company) return NextResponse.json({ ok: false, error: "COMPANY_NOT_FOUND" }, { status: 404 });

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

    const provider = s((cred as any)?.signature_provider || "none");
    if (provider !== "digigo") {
      return NextResponse.json(
        { ok: false, error: "TTN_NOT_CONFIGURED", message: "Signature DigiGo non configurée." },
        { status: 400 }
      );
    }

    const cfg =
      (cred as any)?.signature_config && typeof (cred as any).signature_config === "object" ? (cred as any).signature_config : {};

    const credentialId = s(cfg?.digigo_signer_email || (cred as any)?.cert_email || "");
    if (!credentialId) {
      return NextResponse.json(
        {
          ok: false,
          error: "EMAIL_DIGIGO_COMPANY_MISSING",
          message: "Renseignez l’email DigiGo dans Paramètres DigiGo (société).",
        },
        { status: 400 }
      );
    }

    const { data: items, error: itErr } = await service
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice_id)
      .order("line_no", { ascending: true });

    if (itErr) return NextResponse.json({ ok: false, error: "ITEMS_READ_FAILED", message: itErr.message }, { status: 500 });

    const calc = computeFromItems(items ?? []);
    const stampEnabled = Boolean((invoice as any)?.stamp_enabled);
    const stampAmount = n((invoice as any)?.stamp_amount);

    const ht = calc.ht;
    const tva = calc.tva;
    const ttc = calc.ttc + (stampEnabled ? stampAmount : 0);

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
          country: s((company as any)?.country ?? "TN"),
        },
        invoice: {
          documentType: s((invoice as any)?.document_type ?? "facture"),
          number: s((invoice as any)?.invoice_number ?? ""),
          issueDate: s((invoice as any)?.issue_date ?? ""),
          dueDate: s((invoice as any)?.due_date ?? ""),
          currency: s((invoice as any)?.currency ?? "TND"),
          customerName: s((invoice as any)?.customer_name ?? ""),
          customerTaxId: s((invoice as any)?.customer_tax_id ?? ""),
          customerEmail: s((invoice as any)?.customer_email ?? ""),
          customerPhone: s((invoice as any)?.customer_phone ?? ""),
          customerAddress: s((invoice as any)?.customer_address ?? ""),
          notes: s((invoice as any)?.notes ?? (invoice as any)?.note ?? ""),
        },
        totals: {
          ht,
          tva,
          ttc,
          stampEnabled,
          stampAmount,
        },
        items: (items ?? []).map((it: any) => ({
          description: s(it.description ?? ""),
          qty: n(it.quantity ?? 1),
          price: n(it.unit_price_ht ?? it.unit_price ?? 0),
          vat: n(it.vat_pct ?? it.vatPct ?? 0),
          discount: n(it.discount_pct ?? it.discountPct ?? 0),
        })),
        purpose: "ttn",
      });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: "TEIF_BUILD_FAILED", message: friendlyTeifError(e?.message || String(e)) },
        { status: 400 }
      );
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
      return NextResponse.json(
        { ok: false, error: "DIGIGO_AUTHORIZE_URL_FAILED", message: s(e?.message || e) },
        { status: 500 }
      );
    }

    await service
      .from("invoice_signatures")
      .upsert(
        {
          invoice_id,
          provider: "digigo",
          state: "pending",
          unsigned_hash,
          unsigned_xml,
          signer_user_id: auth.user.id,
          meta: {
            credentialId,
            state: stateStr,
            environment: environment || undefined,
          },
        },
        { onConflict: "invoice_id" }
      )
      .select("id")
      .single();

    return NextResponse.json({ ok: true, authorize_url, state: stateStr, unsigned_hash }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
