import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildCompactTeifXml, validateTeifMinimum } from "@/lib/ttn/teif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V16: TEIF/XML export with hard limit <= 50 Ko.
 * NOTE: Full TEIF/XSD validation requires the official XSD from TTN.
 * We generate a compact, deterministic XML with the fields we have in DB.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id  } = await ctx.params;
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json(
        { ok: false, error: invErr?.message || "Not found" },
        { status: 404 }
      );
    }

    const { data: items } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", id)
      .order("line_no", { ascending: true });

    const { data: company } = await supabase
      .from("companies")
      .select("*")
      .eq("id", (invoice as any).company_id)
      .single();

    // ✅ Seller snapshot: if invoice has seller_* fields, prefer them for TTN/TEIF
    const sellerSnapshot = (invoice as any)?.seller_tax_id
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

    // Minimal "TTN-ready" validation (does not replace XSD validation)
    const v = validateTeifMinimum({ invoice, items: items ?? [], company: sellerCompany });

    if (!v.ok) {
      const errs = Array.isArray(v.errors) ? v.errors : [];
      const msg = errs.length
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

    const xml = buildCompactTeifXml({ invoice, items: items ?? [], company: sellerCompany });

    const sizeBytes = Buffer.byteLength(xml, "utf8");

    // Hard limit required by TTN pricing/processing threshold: 50 Ko
    if (sizeBytes > 50_000) {
      return NextResponse.json(
        {
          ok: false,
          error: `XML dépasse la limite TTN (50 Ko). Taille actuelle: ${sizeBytes} octets.`,
        },
        { status: 413 }
      );
    }

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoice-${(invoice as any).id}.xml"`,
        "X-XML-Size": String(sizeBytes),
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
