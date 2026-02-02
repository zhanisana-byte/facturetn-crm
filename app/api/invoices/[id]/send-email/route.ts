import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  to?: string;
  subject?: string;
  message?: string;
};

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function POST(req: Request, ctx: Ctx) {
  const { id: invoiceId } = await ctx.params;

  if (!invoiceId) {
    return NextResponse.json(
      { ok: false, error: "Missing invoice id" },
      { status: 400 }
    );
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const to = String(body.to ?? "").trim();
  const subject = String(body.subject ?? "").trim() || "Votre facture";
  const message = String(body.message ?? "").trim();

  if (!to || !isEmail(to)) {
    return NextResponse.json(
      { ok: false, error: "Invalid recipient email (to)" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr || !invoice) {
    return NextResponse.json(
      { ok: false, error: "Invoice not found", details: invErr?.message ?? null },
      { status: 404 }
    );
  }

  const companyId =
    (invoice as any)?.company_id ??
    (invoice as any)?.seller_company_id ??
    null;

  let company: any = null;
  if (companyId) {
    const { data: c } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();
    company = c ?? null;
  }

  const sellerCompany = company ?? (invoice as any)?.company ?? null;

  const supplier = {
    name: String(
      (sellerCompany as any)?.company_name ??
      (sellerCompany as any)?.legal_name ??
      (sellerCompany as any)?.name ??
      ""
    ),
    taxId: String((sellerCompany as any)?.tax_id ?? (sellerCompany as any)?.vat_number ?? ""),
    address: String((sellerCompany as any)?.address ?? (sellerCompany as any)?.address_line ?? ""),
    city: String((sellerCompany as any)?.city ?? ""),
  };

  const invoiceNumber = String(
    (invoice as any)?.invoice_number ?? (invoice as any)?.number ?? invoiceId
  );
  const invoiceTitle = `Facture ${invoiceNumber}`;

  const smtpConfigured =
    !!process.env.SMTP_HOST &&
    !!process.env.SMTP_PORT &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_PASS;

  if (!smtpConfigured) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ ok: false, error: "Email service not configured." }, { status: 404 });
    }
    return NextResponse.json(
      {
        ok: false,
        disabled: true,
        error: "Email sending is not configured (SMTP env missing).",
        preview: {
          to,
          subject,
          invoiceTitle,
          supplier,
          message,
        },
      },
      { status: 503 }
    );
  }

  // If SMTP is present but we still return 501 below, it means the logic isn't there.
  // In production, we should just say disabled.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Email feature disabled." }, { status: 403 });
  }

  return NextResponse.json(
    {
      ok: false,
      disabled: true,
      error:
        "SMTP env is present but email sender is not implemented yet (add nodemailer/provider).",
      preview: { to, subject, invoiceTitle, supplier, message },
    },
    { status: 501 }
  );
}
