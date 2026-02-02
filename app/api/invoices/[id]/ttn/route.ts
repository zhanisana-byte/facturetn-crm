import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import { buildCompactTeifXml, validateTeifMinimum, enforceMaxSize } from "@/lib/ttn/teif";
import { saveEfactSOAP, type TTNWebserviceConfig } from "@/lib/ttn/webservice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowIso() {
  return new Date().toISOString();
}
function s(v: unknown) {
  return String(v ?? "").trim();
}

async function getSignaturePolicy(supabase: any, companyId: string) {
  const { data: prod } = await supabase
    .from("ttn_credentials")
    .select("signature_provider,require_signature,environment")
    .eq("company_id", companyId)
    .eq("environment", "production")
    .maybeSingle();

  const { data: test } = prod
    ? { data: null }
    : await supabase
        .from("ttn_credentials")
        .select("signature_provider,require_signature,environment")
        .eq("company_id", companyId)
        .eq("environment", "test")
        .maybeSingle();

  const cred = prod ?? test;
  const provider = String((cred as any)?.signature_provider ?? "none");
  const required = Boolean((cred as any)?.require_signature) || provider !== "none";
  return { required, provider };
}

async function hasSignedXml(supabase: any, invoiceId: string) {
  const { data: sig } = await supabase
    .from("invoice_signatures")
    .select("signed_xml")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  return sig?.signed_xml ? String(sig.signed_xml) : null;
}

async function requireValidationIfNeeded(_supabase: any, invoice: any) {
  const need = Boolean(invoice?.require_accountant_validation);
  if (!need) return true;
  return Boolean(invoice?.accountant_validated_at);
}

async function writeTtnEvent(supabase: any, invoice: any, status: string, message: string, userId?: string) {
  const companyId = String(invoice?.company_id || "");
  await supabase.from("ttn_events").insert({
    invoice_id: invoice?.id ?? null,
    company_id: companyId || null,
    status,
    message: message.slice(0, 2000),
    created_by: userId ?? null,
    created_at: nowIso(),
  });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const { data: invoice, error: invErr } = await supabase.from("invoices").select("*").eq("id", id).single();
  if (invErr || !invoice) {
    return NextResponse.json({ ok: false, error: invErr?.message ?? "INVOICE_NOT_FOUND" }, { status: 404 });
  }

  const companyId = String((invoice as any).company_id || "");
  if (!companyId) return NextResponse.json({ ok: false, error: "COMPANY_ID_MISSING" }, { status: 400 });

  const docType = String((invoice as any).document_type ?? "facture").toLowerCase();
  if (docType === "devis") {
    return NextResponse.json({ ok: false, error: "DEVIS_NOT_SENDABLE_TTN" }, { status: 400 });
  }

  const ttnStatus = String((invoice as any).ttn_status || "not_sent");
  if (ttnStatus !== "not_sent") {
    return NextResponse.json({ ok: false, error: "INVOICE_LOCKED_TTN" }, { status: 409 });
  }

  const allowed = await canCompanyAction(supabase, auth.user.id, companyId, "submit_ttn");
  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  const okValidation = await requireValidationIfNeeded(supabase, invoice);
  if (!okValidation) {
    return NextResponse.json({ ok: false, error: "VALIDATION_REQUIRED" }, { status: 409 });
  }

  const currency = s((invoice as any).currency || "TND").toUpperCase();
  if (currency !== "TND") {
    return NextResponse.json({ ok: false, error: "CURRENCY_NOT_ALLOWED" }, { status: 400 });
  }

  const { data: company, error: compErr } = await supabase.from("companies").select("*").eq("id", companyId).single();
  if (compErr || !company) {
    return NextResponse.json({ ok: false, error: compErr?.message ?? "COMPANY_NOT_FOUND" }, { status: 500 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });

  if (itemsErr) return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });

  const { data: credProd } = await supabase
    .from("ttn_credentials")
    .select("ws_url, ws_login, ws_password, ws_matricule, environment")
    .eq("company_id", companyId)
    .eq("environment", "production")
    .maybeSingle();

  const { data: credTest } = credProd
    ? { data: null }
    : await supabase
        .from("ttn_credentials")
        .select("ws_url, ws_login, ws_password, ws_matricule, environment")
        .eq("company_id", companyId)
        .eq("environment", "test")
        .maybeSingle();

  const cred = credProd ?? credTest;

  const cfg: TTNWebserviceConfig = {
    url: s((cred as any)?.ws_url),
    login: s((cred as any)?.ws_login),
    password: s((cred as any)?.ws_password),
    matricule: s((cred as any)?.ws_matricule),
  };

  if (!cfg.url || !cfg.login || !cfg.password || !cfg.matricule) {
    return NextResponse.json({ ok: false, error: "TTN_CONFIG_MISSING" }, { status: 400 });
  }

  const destination = s((invoice as any).destination);
  const baseNotes = s((invoice as any).notes);
  const notes =
    destination && !baseNotes.toLowerCase().includes("destination")
      ? `${baseNotes ? baseNotes + "\n" : ""}Destination: ${destination}`
      : baseNotes;

  const teifXml = buildCompactTeifXml({
    invoiceId: String((invoice as any).id),
    companyId: String((company as any).id),
    documentType: String(
      (invoice as any).document_type ?? ((invoice as any).invoice_type === "credit_note" ? "avoir" : "facture")
    ),
    invoiceNumber: s((invoice as any).invoice_number ?? (invoice as any).number ?? (invoice as any).ref),
    issueDate: s((invoice as any).issue_date ?? (invoice as any).date ?? (invoice as any).created_at),
    dueDate: s((invoice as any).due_date),
    currency: "TND",
    supplier: {
      name: s((company as any).company_name ?? (company as any).name),
      taxId: s((company as any).tax_id),
      address: s((company as any).address),
      street: s((company as any).street),
      city: s((company as any).city),
      postalCode: s((company as any).postal_code),
      country: s((company as any).country ?? "TN"),
    },
    customer: {
      name: s((invoice as any).customer_name ?? (invoice as any).client_name ?? (invoice as any).customer),
      taxId: ((invoice as any).customer_tax_id ?? null) as string | null,
      address: s((invoice as any).customer_address),
      city: s((invoice as any).customer_city),
      postalCode: s((invoice as any).customer_postal_code),
      country: s((invoice as any).customer_country ?? "TN"),
    },
    totals: {
      ht: Number((invoice as any).total_ht ?? (invoice as any).subtotal_ht ?? 0),
      tva: Number((invoice as any).total_tva ?? (invoice as any).total_vat ?? 0),
      ttc: Number((invoice as any).total_ttc ?? (invoice as any).total ?? 0),
      stampEnabled: Boolean((invoice as any).stamp_enabled ?? false),
      stampAmount: Number((invoice as any).stamp_amount ?? 0),
    },
    notes,
    items: (items ?? []).map((it: any) => ({
      description: s(it.description ?? it.label),
      qty: Number(it.qty ?? it.quantity ?? 1),
      price: Number(it.price ?? it.unit_price ?? it.unit_price_ht ?? 0),
      vat: Number(it.vat ?? it.vat_pct ?? 0),
      discount: Number(it.discount ?? it.discount_pct ?? 0),
    })),
  });

  const problems = validateTeifMinimum(teifXml);
  if (problems.length > 0) {
    await writeTtnEvent(supabase, invoice, "failed", `TEIF_INVALID: ${problems.join(" | ")}`, auth.user.id);

    try {
      await supabase
        .from("invoices")
        .update({
          ttn_status: "rejected",
          ttn_last_error: `TEIF_INVALID: ${problems.join(" | ")}`.slice(0, 4000),
        })
        .eq("id", id);
    } catch {}

    return NextResponse.json({ ok: false, error: "TEIF_INVALID", details: problems }, { status: 400 });
  }

  const sized = enforceMaxSize(teifXml);
  let finalXml = sized.xml;

  const sigPolicy = await getSignaturePolicy(supabase, companyId);
  if (sigPolicy.required) {
    const signedXml = await hasSignedXml(supabase, id);
    if (!signedXml) {
      return NextResponse.json({ ok: false, error: "SIGNATURE_REQUIRED" }, { status: 409 });
    }
    finalXml = signedXml;
  }

  await supabase
    .from("ttn_invoice_queue")
    .update({ status: "canceled", canceled_at: nowIso(), last_error: null })
    .eq("invoice_id", id);

  await writeTtnEvent(supabase, invoice, "pending", "TTN_SEND_STARTED", auth.user.id);

  try {
    const wsRes = await saveEfactSOAP(cfg, finalXml);

    await writeTtnEvent(
      supabase,
      invoice,
      wsRes.ok ? "sent" : "failed",
      wsRes.ok ? "TTN_SEND_OK" : `TTN_SEND_HTTP_${wsRes.status}`,
      auth.user.id
    );

    const patch: any = {
      ttn_save_id: wsRes.idSaveEfact ?? null,
      ttn_last_error: wsRes.ok ? null : `HTTP_${wsRes.status}`,
      ttn_status: wsRes.ok ? "submitted" : "rejected",
      ttn_submitted_at: wsRes.ok ? nowIso() : null,
      ttn_scheduled_at: null,
    };

    try {
      await supabase.from("invoices").update(patch).eq("id", id);
    } catch {
      await writeTtnEvent(
        supabase,
        invoice,
        "failed",
        "INVOICE_UPDATE_BLOCKED_AFTER_SIGNATURE",
        auth.user.id
      );
    }

    return NextResponse.json({
      ok: wsRes.ok,
      status: wsRes.status,
      ttn: wsRes,
      teif_meta: { original_size: sized.originalSize, final_size: sized.finalSize, trimmed: sized.trimmed },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "TTN_SEND_ERROR");
    await writeTtnEvent(supabase, invoice, "failed", msg, auth.user.id);

    try {
      await supabase.from("invoices").update({ ttn_status: "rejected", ttn_last_error: msg.slice(0, 4000) }).eq("id", id);
    } catch {}

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
