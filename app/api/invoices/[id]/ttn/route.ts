// app/api/invoices/[id]/ttn/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import {
  buildCompactTeifXml,
  validateTeifMinimum,
  enforceMaxSize,
} from "@/lib/ttn/teif";
import { saveEfactSOAP, type TTNWebserviceConfig } from "@/lib/ttn/webservice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowIso() {
  return new Date().toISOString();
}

function normalizeStr(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json(
      { ok: false, error: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  // 1) Invoice
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json(
      { ok: false, error: invErr?.message ?? "INVOICE_NOT_FOUND" },
      { status: 404 }
    );
  }

  const companyId = (invoice as any).company_id as string | null;

  const docType = String((invoice as any).document_type ?? "facture").toLowerCase();
  if (docType === "devis") {
    return NextResponse.json(
      { ok: false, error: "DEVIS_NOT_SENDABLE_TTN", message: "Un devis ne peut pas être envoyé à la TTN (envoi TTN réservé aux factures/avoirs)." },
      { status: 400 }
    );
  }
  if (!companyId) {
    return NextResponse.json(
      { ok: false, error: "COMPANY_ID_MISSING" },
      { status: 400 }
    );
  }

  // 2) Permission
  const allowed = await canCompanyAction(
    supabase,
    auth.user.id,
    companyId,
    "submit_ttn"
  );
  if (!allowed) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  // 3) Currency rule (TTN = TND)
  const currency = normalizeStr((invoice as any).currency || "TND").toUpperCase();
  if (currency !== "TND") {
    return NextResponse.json(
      {
        ok: false,
        error: "CURRENCY_NOT_ALLOWED",
        message: "Envoi TTN refusé: la facture doit être en TND.",
      },
      { status: 400 }
    );
  }

  // 4) Items
  const { data: items, error: itemsErr } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });

  if (itemsErr) {
    return NextResponse.json(
      { ok: false, error: itemsErr.message },
      { status: 500 }
    );
  }

  // 5) Company
  const { data: company, error: compErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (compErr || !company) {
    return NextResponse.json(
      { ok: false, error: compErr?.message ?? "COMPANY_NOT_FOUND" },
      { status: 500 }
    );
  }

  // 6) TTN settings (IMPORTANT: table = company_ttn_settings)
  const { data: ttn, error: ttnErr } = await supabase
    .from("company_ttn_settings")
    .select("ws_url, ws_login, ws_password, ttn_matricule")
    .eq("company_id", companyId)
    .maybeSingle();

  if (ttnErr) {
    return NextResponse.json({ ok: false, error: ttnErr.message }, { status: 500 });
  }

  const cfg: TTNWebserviceConfig = {
    url: normalizeStr(ttn?.ws_url),
    login: normalizeStr(ttn?.ws_login),
    password: normalizeStr(ttn?.ws_password),
    matricule: normalizeStr(ttn?.ttn_matricule),
  };

  if (!cfg.url || !cfg.login || !cfg.password || !cfg.matricule) {
    return NextResponse.json(
      { ok: false, error: "TTN_CONFIG_MISSING" },
      { status: 400 }
    );
  }

  // 7) Notes (destination etc.)
  const destination = normalizeStr((invoice as any).destination);
  const baseNotes = normalizeStr((invoice as any).notes);
  const notes =
    destination && !baseNotes.toLowerCase().includes("destination")
      ? `${baseNotes ? baseNotes + "\n" : ""}Destination: ${destination}`
      : baseNotes;

  // 8) Build XML (TEIF compact) + minimum validation
  const teifXml = buildCompactTeifXml({
    invoiceId: String((invoice as any).id),
    companyId: String((company as any).id),

    documentType: String((invoice as any).document_type ?? (invoice as any).doc_type ?? ((invoice as any).invoice_type === 'credit_note' ? 'avoir' : 'facture')),

    invoiceNumber: normalizeStr(
      (invoice as any).invoice_number ??
        (invoice as any).number ??
        (invoice as any).ref
    ),
    issueDate: normalizeStr(
      (invoice as any).issue_date ??
        (invoice as any).date ??
        (invoice as any).created_at
    ),
    dueDate: normalizeStr((invoice as any).due_date),
    currency: "TND",

    // Supplier (company)
    supplier: {
      name: normalizeStr((company as any).company_name ?? (company as any).name),
      taxId: normalizeStr((company as any).tax_id),
      address: normalizeStr((company as any).address),
      street: normalizeStr((company as any).street),
      city: normalizeStr((company as any).city),
      postalCode: normalizeStr((company as any).postal_code),
      country: normalizeStr((company as any).country ?? "TN"),
    },

    // Customer (invoice)
    customer: {
      name: normalizeStr(
        (invoice as any).customer_name ??
          (invoice as any).client_name ??
          (invoice as any).customer
      ),
      taxId: ((invoice as any).customer_tax_id ?? null) as string | null,
      address: normalizeStr((invoice as any).customer_address),
      city: normalizeStr((invoice as any).customer_city),
      postalCode: normalizeStr((invoice as any).customer_postal_code),
      country: normalizeStr((invoice as any).customer_country ?? "TN"),
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
      description: normalizeStr(it.description ?? it.label),
      qty: Number(it.qty ?? it.quantity ?? 1),
      price: Number(it.price ?? it.unit_price ?? it.unit_price_ht ?? 0),
      vat: Number(it.vat ?? it.vat_pct ?? 0),
      discount: Number(it.discount ?? it.discount_pct ?? 0),
    })),
  });

  const problems = validateTeifMinimum(teifXml);
  if (problems.length > 0) {
    // Stocker l’erreur côté invoice pour debug
    await supabase
      .from("invoices")
      .update({
        ttn_status: "rejected",
        ttn_last_error: `TEIF_INVALID: ${problems.join(" | ")}`.slice(0, 4000),
      })
      .eq("id", id);

    return NextResponse.json(
      { ok: false, error: "TEIF_INVALID", details: problems },
      { status: 400 }
    );
  }

  const sized = enforceMaxSize(teifXml);
  let finalXml = sized.xml;

  // 8.bis) Signature: si la société exige une signature, on refuse l'envoi TTN
  // tant qu'un XML signé n'est pas disponible.
  // NOTE: le flux de signature (USB Agent / DigiGO / DSS / HSM) stocke le XML signé
  // dans public.invoice_signatures.
  const { data: cred } = await supabase
    .from("ttn_credentials")
    .select("signature_provider,require_signature")
    .eq("company_id", companyId)
    .eq("environment", "production")
    .maybeSingle();

  const sigProvider = String((cred as any)?.signature_provider ?? "none");
  const sigRequired = Boolean((cred as any)?.require_signature) || sigProvider !== "none";

  if (sigRequired) {
    const { data: sig } = await supabase
      .from("invoice_signatures")
      .select("signed_xml")
      .eq("invoice_id", id)
      .maybeSingle();

    if (!sig?.signed_xml) {
      return NextResponse.json(
        {
          ok: false,
          error: "SIGNATURE_REQUIRED",
          message:
            "Signature requise: veuillez signer le TEIF avant l'envoi TTN (Actions → Ajouter signature).",
        },
        { status: 400 }
      );
    }

    finalXml = String(sig.signed_xml);
  }

  // 9) Avant envoi : marquer submitted (optimiste) + nettoyer schedule
  await supabase
    .from("invoices")
    .update({
      ttn_status: "submitted",
      ttn_last_error: null,
      ttn_submitted_at: nowIso(),
      // si déjà programmé, on efface la date
      ttn_scheduled_at: null,
    })
    .eq("id", id);

  // annuler la queue si existante
  await supabase
    .from("ttn_invoice_queue")
    .update({ status: "canceled", canceled_at: nowIso(), last_error: null })
    .eq("invoice_id", id);

  // 10) SOAP saveEfact
  try {
    const wsRes = await saveEfactSOAP(cfg, finalXml);

    const patch: any = {
      ttn_save_id: wsRes.idSaveEfact ?? null,
      ttn_last_error: wsRes.ok ? null : `HTTP_${wsRes.status}`,
      ttn_status: wsRes.ok ? "submitted" : "rejected",
    };

    await supabase.from("invoices").update(patch).eq("id", id);

    return NextResponse.json({
      ok: wsRes.ok,
      status: wsRes.status,
      ttn: wsRes,
      teif_meta: {
        original_size: sized.originalSize,
        final_size: sized.finalSize,
        trimmed: sized.trimmed,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? "TTN_SEND_ERROR");

    await supabase
      .from("invoices")
      .update({
        ttn_status: "rejected",
        ttn_last_error: msg.slice(0, 4000),
      })
      .eq("id", id);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
