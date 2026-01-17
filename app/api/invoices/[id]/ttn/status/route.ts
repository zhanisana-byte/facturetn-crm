import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consultEfactSOAP, TTNWebserviceConfig } from "@/lib/ttn/webservice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractFirst(tag: string, xml: string) {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

/**
 * v13: Poll TTN state via consultEfact, using idSaveEfact stored on the invoice.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id  } = await ctx.params;
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id,company_id,ttn_save_id,ttn_reference,ttn_generated_ref,ttn_status")
      .eq("id", id)
      .single();
    if (invErr || !invoice) {
      return NextResponse.json({ ok: false, error: invErr?.message || "Facture introuvable" }, { status: 404 });
    }

    const { data: cred, error: credErr } = await supabase
      .from("ttn_credentials")
      .select("ws_url,ws_login,ws_password,ws_matricule")
      .eq("company_id", invoice.company_id)
      .maybeSingle();
    if (credErr) return NextResponse.json({ ok: false, error: credErr.message }, { status: 500 });

    if (!cred?.ws_login || !cred?.ws_password) {
      return NextResponse.json({ ok: true, mode: "no_webservice", invoice });
    }

    if (!invoice.ttn_save_id && !invoice.ttn_reference && !invoice.ttn_generated_ref) {
      return NextResponse.json({ ok: false, error: "Aucune référence TTN pour consulter la facture." }, { status: 400 });
    }

    const cfg: TTNWebserviceConfig = {
      url: cred.ws_url || "https://elfatoora.tn/ElfatouraServices/EfactService",
      login: cred.ws_login,
      password: cred.ws_password,
      matricule: cred.ws_matricule || "",
    };

    const soap = await consultEfactSOAP(cfg, {
      idSaveEfact: invoice.ttn_save_id || undefined,
      documentNumber: undefined,
      generatedRef: invoice.ttn_generated_ref || undefined,
    });

    const generatedRef = extractFirst("generatedRef", soap.raw);
    // Very light interpretation: if listAcknowlegments exists => likely rejected, otherwise accepted.
    const hasAck = /listAcknowlegments/i.test(soap.raw);
    const inferred = generatedRef ? (hasAck ? "rejected" : "accepted") : null;

    if (generatedRef && generatedRef !== invoice.ttn_generated_ref) {
      await supabase
        .from("invoices")
        .update({ ttn_generated_ref: generatedRef, ...(inferred ? { ttn_status: inferred } : {}) })
        .eq("id", invoice.id);
    }

    return NextResponse.json({ ok: soap.ok, status: soap.status, generatedRef, inferred, raw: soap.raw });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
