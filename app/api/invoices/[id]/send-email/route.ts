import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCompactTeifXml, validateTeifMinimum } from "@/lib/ttn/teif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This route only LOGS the email send request.
// Real email provider integration can be plugged later.

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id  } = await ctx.params;

  /* -----------------------------
   * Parse & normalize payload
   * ----------------------------- */
  const body = await req.json().catch(() => ({}));

  const to_email = String(body?.to_email || body?.toEmail || "").trim();

  const cc_emails = Array.isArray(body?.cc_emails)
    ? body.cc_emails.map((x: any) => String(x || "").trim()).filter(Boolean)
    : String(body?.cc || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

  const bcc_emails = Array.isArray(body?.bcc_emails)
    ? body.bcc_emails.map((x: any) => String(x || "").trim()).filter(Boolean)
    : String(body?.bcc || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

  const subject = String(body?.subject || "Facture").trim();
  const message = body?.message ? String(body.message) : null;

  if (!to_email) {
    return NextResponse.json(
      { ok: false, error: "Email destinataire manquant" },
      { status: 400 }
    );
  }

  /* -----------------------------
   * Auth
   * ----------------------------- */
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  /* -----------------------------
   * Load invoice data (same logic as /xml)
   * ----------------------------- */
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single();

  if (invErr || !invoice) {
    return NextResponse.json(
      { ok: false, error: invErr?.message || "Invoice not found" },
      { status: 404 }
    );
  }

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

  const { data: company, error: compErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", (invoice as any).company_id)
    .single();

  if (compErr || !company) {
    return NextResponse.json(
      { ok: false, error: compErr?.message || "Company not found" },
      { status: 500 }
    );
  }

  /* -----------------------------
   * TEIF validation (TTN minimum)
   * ----------------------------- */
  const v = validateTeifMinimum({
    invoice,
    items: items ?? [],
    company,
  });

  if (!v.ok) {
    const errs = Array.isArray(v.errors) ? v.errors : [];
    const msg =
      errs.length > 0
        ? `Impossible de générer un TEIF conforme: ${errs.join(", ")}.`
        : "Impossible de générer un TEIF conforme: données manquantes.";

    return NextResponse.json(
      {
        ok: false,
        error: msg,
        errors: errs,
      },
      { status: 400 }
    );
  }

  /* -----------------------------
   * Build XML & size check (50 Ko)
   * ----------------------------- */
  const xml = buildCompactTeifXml({
    invoice,
    items: items ?? [],
    company,
  });

  const xml_size_bytes = Buffer.byteLength(xml, "utf8");

  if (xml_size_bytes > 50_000) {
    return NextResponse.json(
      {
        ok: false,
        error: `XML dépasse la limite TTN (50 Ko). Taille actuelle: ${xml_size_bytes} octets.`,
      },
      { status: 413 }
    );
  }

  /* -----------------------------
   * Log email request (queued)
   * ----------------------------- */
  const { error: logErr } = await supabase
    .from("invoice_email_logs")
    .insert({
      invoice_id: id,
      sent_by: auth.user.id,
      to_email,
      cc_emails,
      bcc_emails,
      subject,
      message,
      status: "queued",
      provider: "placeholder",
      company_id: (invoice as any).company_id,
      attachments: {
        pdf_url: `/api/invoices/${id}/pdf`,
        xml_url: `/api/invoices/${id}/xml`,
      },
      xml_size_bytes,
    });

  if (logErr) {
    return NextResponse.json(
      { ok: false, error: logErr.message },
      { status: 500 }
    );
  }

  /* -----------------------------
   * Success
   * ----------------------------- */
  return NextResponse.json({
    ok: true,
    status: "queued",
    xml_size_bytes,
  });
}
