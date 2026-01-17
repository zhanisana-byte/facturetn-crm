import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCompactTeifXml, validateTeifMinimum, enforceMaxSize } from "@/lib/ttn/teif";
import { saveEfactSOAP } from "@/lib/ttn/webservice";
import { signTeifXmlIfNeeded } from "@/lib/ttn/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TTN TEST Submit:
 * - Permission check (membership.can_submit_ttn or owner)
 * - Requires accountant validation if invoice requires it
 * - Builds TEIF XML (<=50KB), signs optionally
 * - If WS credentials missing => DOES NOT mark submitted (returns TEIF + error)
 * - TEST environment only
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id  } = await ctx.params;
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ ok: false, error: invErr?.message || "Facture introuvable" }, { status: 404 });
    }

    // Permission: owner OR membership.can_submit_ttn
    const { data: membership, error: mErr } = await supabase
      .from("memberships")
      .select("role,is_active,can_submit_ttn")
      .eq("company_id", invoice.company_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 400 });

    const canSubmitTTN = !!membership?.is_active && (membership?.role === "owner" || membership?.can_submit_ttn === true);
    if (!canSubmitTTN) {
      return NextResponse.json({ ok: false, error: "Accès refusé (permission envoi TTN)." }, { status: 403 });
    }

    // Accountant rule
    if (invoice.require_accountant_validation && !invoice.accountant_validated_at) {
      return NextResponse.json({ ok: false, error: "Validation comptable requise avant envoi TTN." }, { status: 400 });
    }

    // Load TTN credentials
    const { data: cred, error: credErr } = await supabase
      .from("ttn_credentials")
      .select(
        [
          "company_id",
          "ttn_mode",
          "connection_type",
          "environment",
          "cert_serial_number",
          "cert_email",
          "ws_url",
          "ws_login",
          "ws_password",
          "ws_matricule",
          "dss_url",
          "dss_token",
          "dss_profile",
          "require_signature",
        ].join(",")
      )
      .eq("company_id", invoice.company_id)
      .maybeSingle();

    if (credErr) return NextResponse.json({ ok: false, error: credErr.message }, { status: 500 });
    if (!cred) return NextResponse.json({ ok: false, error: "Paramètres TTN manquants pour cette société." }, { status: 400 });

    // ✅ TEST ONLY
    if (String((cred as any).environment || "") !== "test") {
      return NextResponse.json({ ok: false, error: "Envoi bloqué: cette route est en mode TEST uniquement." }, { status: 400 });
    }

    // Load company
    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("*")
      .eq("id", invoice.company_id)
      .single();

    if (cErr || !company) {
      return NextResponse.json({ ok: false, error: cErr?.message || "Société introuvable" }, { status: 404 });
    }

    // Items
    const { data: items, error: itErr } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id);

    if (itErr) return NextResponse.json({ ok: false, error: itErr.message }, { status: 500 });

    // Seller snapshot (prefer invoice.seller_* if present)
    const sellerSnapshot =
      (invoice as any)?.seller_tax_id
        ? {
            tax_id: (invoice as any).seller_tax_id,
            name: (invoice as any).seller_name,
            company_name: (invoice as any).seller_name,
            street: (invoice as any).seller_street,
            address: (invoice as any).seller_street,
            city: (invoice as any).seller_city,
            zip: (invoice as any).seller_zip,
            postal_code: (invoice as any).seller_zip,
          }
        : null;

    const sellerCompany = sellerSnapshot ?? company;

    // ✅ Buyer snapshot: if invoice.customer_name missing, load from customers
    // (so TEIF buyer fields are not empty)
    let buyerFromCustomer: any = null;

    const invCustomerName = String((invoice as any).customer_name || "");
    const invCustomerTaxId = String((invoice as any).customer_tax_id || "");

    if ((!invCustomerName || !invCustomerTaxId) && invoice.customer_id) {
      const { data: cust } = await supabase
        .from("customers")
        .select("id,name,tax_id,address,city,zip,postal_code,email,phone")
        .eq("id", invoice.customer_id)
        .maybeSingle();

      if (cust) {
        buyerFromCustomer = cust;

        // Optional: write snapshots into invoice (stable history)
        await supabase
          .from("invoices")
          .update({
            customer_name: (cust as any).name ?? null,
            customer_tax_id: (cust as any).tax_id ?? null,
            customer_address: (cust as any).address ?? null,
            customer_city: (cust as any).city ?? null,
            customer_zip: (cust as any).zip ?? (cust as any).postal_code ?? null,
            customer_email: (cust as any).email ?? null,
            customer_phone: (cust as any).phone ?? null,
          })
          .eq("id", invoice.id);
      }
    }

    // Reload invoice snapshot if we just updated it (light approach: merge)
    const invoiceForTeif: any = {
      ...invoice,
      customer_name: (invoice as any).customer_name || (buyerFromCustomer as any)?.name || null,
      customer_tax_id: (invoice as any).customer_tax_id || (buyerFromCustomer as any)?.tax_id || null,
      customer_address: (invoice as any).customer_address || (buyerFromCustomer as any)?.address || null,
      customer_city: (invoice as any).customer_city || (buyerFromCustomer as any)?.city || null,
      customer_zip: (invoice as any).customer_zip || (buyerFromCustomer as any)?.zip || (buyerFromCustomer as any)?.postal_code || null,
      customer_email: (invoice as any).customer_email || (buyerFromCustomer as any)?.email || null,
      customer_phone: (invoice as any).customer_phone || (buyerFromCustomer as any)?.phone || null,
    };

    // 1) Build TEIF (unsigned)
    const unsignedTeif = buildCompactTeifXml({
      invoice: invoiceForTeif,
      items: items ?? [],
      company: sellerCompany,
    });

    const minCheck = validateTeifMinimum({
      invoice: invoiceForTeif,
      items: items ?? [],
      company: sellerCompany,
    });

    if (!minCheck.ok) {
      return NextResponse.json({ ok: false, error: "TEIF incomplet", details: minCheck.errors }, { status: 400 });
    }

    // Size <= 50KB before signature
    const size = enforceMaxSize(unsignedTeif, 50 * 1024);
    if (!size.ok) {
      return NextResponse.json(
        { ok: false, error: "TEIF dépasse 50KB", size_bytes: size.size, max_bytes: size.maxBytes },
        { status: 400 }
      );
    }

    // 2) Optional DSS signature
    const signedRes = await signTeifXmlIfNeeded(unsignedTeif, {
      dss_url: (cred as any).dss_url,
      dss_token: (cred as any).dss_token,
      dss_profile: (cred as any).dss_profile,
      require_signature: (cred as any).require_signature,
    });

    const teifXml = signedRes.xml;

    // Size <= 50KB after signature
    const size2 = enforceMaxSize(teifXml, 50 * 1024);
    if (!size2.ok) {
      return NextResponse.json(
        { ok: false, error: "TEIF signé dépasse 50KB", size_bytes: size2.size, max_bytes: size2.maxBytes },
        { status: 400 }
      );
    }

    // ✅ If WS is not configured, DO NOT mark submitted (no fake status)
    const hasWs =
      String((cred as any).connection_type || "") === "webservice" &&
      !!(cred as any).ws_login &&
      !!(cred as any).ws_password;

    if (!hasWs) {
      // Trace event (generated only)
      await supabase.from("ttn_events").insert({
        invoice_id: invoice.id,
        company_id: invoice.company_id,
        status: "generated",
        message: "TEIF généré (TEST) mais Webservice non configuré: ws_login/ws_password manquants.",
        created_by: auth.user.id,
      });

      // Keep invoice not sent
      await supabase
        .from("invoices")
        .update({
          ttn_status: "not_sent",
          ttn_last_error: "WS non configuré: ws_login/ws_password manquants.",
          ttn_signed: Boolean(signedRes.signed),
        })
        .eq("id", invoice.id);

      return NextResponse.json(
        {
          ok: false,
          error: "Webservice non configuré (ws_login/ws_password). TEIF généré mais non envoyé.",
          teif_xml: teifXml,
          ttn_signed: Boolean(signedRes.signed),
        },
        { status: 400 }
      );
    }

    // 3) SOAP submission (TEST)
    const soapRes = await saveEfactSOAP(
      {
        url: (cred as any).ws_url || "https://elfatoora.tn/ElfatouraServices/EfactService",
        login: (cred as any).ws_login,
        password: (cred as any).ws_password,
        matricule: (cred as any).ws_matricule || company.tax_id || "",
      },
      teifXml
    );

    if (!soapRes.ok) {
      await supabase.from("ttn_events").insert({
        invoice_id: invoice.id,
        company_id: invoice.company_id,
        status: "failed",
        message: `Erreur TTN SOAP (TEST): ${soapRes.status}`,
        created_by: auth.user.id,
      });

      await supabase
        .from("invoices")
        .update({
          ttn_status: "rejected",
          ttn_last_error: soapRes.raw?.slice(0, 1500) || "TTN SOAP error",
          ttn_signed: Boolean(signedRes.signed),
        })
        .eq("id", invoice.id);

      return NextResponse.json(
        { ok: false, error: "TTN Webservice error (TEST)", status: soapRes.status, raw: soapRes.raw },
        { status: 502 }
      );
    }

    const now = new Date().toISOString();

    await supabase.from("ttn_events").insert({
      invoice_id: invoice.id,
      company_id: invoice.company_id,
      status: "submitted",
      message: `Envoyée à TTN via Webservice TEST (idSaveEfact=${soapRes.idSaveEfact || "N/A"}).`,
      created_by: auth.user.id,
    });

    const { error: upErr } = await supabase
      .from("invoices")
      .update({
        ttn_status: "submitted",
        ttn_submitted_at: now,
        ttn_last_error: null,
        ttn_scheduled_at: null,
        status: "sent_ttn",
        ttn_save_id: soapRes.idSaveEfact || null,
        ttn_signed: Boolean(signedRes.signed),
      })
      .eq("id", invoice.id);

    if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

    // If queue row exists, mark as sent
    await supabase
      .from("ttn_invoice_queue")
      .update({ status: "sent", updated_at: now })
      .eq("invoice_id", invoice.id)
      .in("status", ["scheduled", "queued"]);

    return NextResponse.json({
      ok: true,
      status: "submitted",
      ttn_save_id: soapRes.idSaveEfact || null,
      ttn_signed: Boolean(signedRes.signed),
      raw: soapRes.raw,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
