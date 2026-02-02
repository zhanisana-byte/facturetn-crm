
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";
import {
  buildCompactTeifXml,
  validateTeifMinimum,
  enforceMaxSize,
} from "@/lib/ttn/teif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

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
  if (!companyId) {
    return NextResponse.json({ ok: false, error: "COMPANY_ID_MISSING" }, { status: 400 });
  }

  const allowed = await canCompanyAction(
    supabase,
    auth.user.id,
    companyId,
    "submit_ttn"
  );

  if (!allowed) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const { data: items, error: itemsErr } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", id)
    .order("line_no", { ascending: true });

  if (itemsErr) {
    return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
  }

  const { data: sellerCompany, error: compErr } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (compErr || !sellerCompany) {
    return NextResponse.json(
      { ok: false, error: compErr?.message ?? "COMPANY_NOT_FOUND" },
      { status: 500 }
    );
  }

  const teifXml = buildCompactTeifXml({
    invoiceId: String((invoice as any).id),
    companyId: String((sellerCompany as any).id),

    purpose: 'ttn',

    documentType: String((invoice as any).document_type ?? (invoice as any).doc_type ?? ((invoice as any).invoice_type === 'credit_note' ? 'avoir' : 'facture')),

    invoiceNumber: String(
      (invoice as any).invoice_number ?? (invoice as any).number ?? (invoice as any).ref ?? ""
    ),
    issueDate: String(
      (invoice as any).issue_date ?? (invoice as any).date ?? (invoice as any).created_at ?? ""
    ),
    dueDate: String((invoice as any).due_date ?? ""),
    currency: String((invoice as any).currency ?? "TND"),

    supplier: {
      name: String((sellerCompany as any).company_name ?? (sellerCompany as any).name ?? ""),
      taxId: String((sellerCompany as any).tax_id ?? ""),
      address: String((sellerCompany as any).address ?? ""),
      city: String((sellerCompany as any).city ?? ""),
      postalCode: String((sellerCompany as any).postal_code ?? ""),
      country: String((sellerCompany as any).country ?? "TN"),
    },

    customer: {
      name: String(
        (invoice as any).customer_name ??
          (invoice as any).client_name ??
          (invoice as any).customer ??
          ""
      ),
      taxId: ((invoice as any).customer_tax_id ?? null) as string | null,
      address: String(
        (invoice as any).customer_address ??
          (invoice as any).client_address ??
          ""
      ),
      city: String(
        (invoice as any).customer_city ??
          (invoice as any).client_city ??
          ""
      ),
      postalCode: String(
        (invoice as any).customer_postal_code ??
          (invoice as any).client_postal_code ??
          ""
      ),
      country: String(
        (invoice as any).customer_country ??
          (invoice as any).client_country ??
          "TN"
      ),
    },

    totals: {
      ht: Number((invoice as any).total_ht ?? (invoice as any).subtotal_ht ?? 0),
      tva: Number((invoice as any).total_tva ?? (invoice as any).total_vat ?? 0),
      ttc: Number((invoice as any).total_ttc ?? (invoice as any).total ?? 0),
      stampEnabled: Boolean((invoice as any).stamp_enabled ?? false),
      stampAmount: Number((invoice as any).stamp_amount ?? 0),
    },

    notes: String((invoice as any).notes ?? ""),

    items: (items ?? []).map((it: any) => ({
      description: String(it.description ?? it.label ?? ""),
      qty: Number(it.qty ?? it.quantity ?? 1),
      price: Number(it.price ?? it.unit_price ?? 0),
      vat: Number(it.vat ?? it.vat_pct ?? 0),
      discount: Number(it.discount ?? 0),
    })),
  });

  const problems = validateTeifMinimum(teifXml);
  if (problems.length > 0) {
    return NextResponse.json(
      { ok: false, error: "TEIF_INVALID", details: problems },
      { status: 400 }
    );
  }

  const sized = enforceMaxSize(teifXml);
  const finalXml = sized.xml;

  return new NextResponse(finalXml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `inline; filename="invoice-${id}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
