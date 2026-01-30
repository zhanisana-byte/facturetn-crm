// app/api/invoices/[id]/ttn/status/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consultEfactSOAP, type TTNWebserviceConfig } from "@/lib/ttn/webservice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractFirst(tag: string, xml: string) {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

function extractAny(tags: string[], xml: string) {
  for (const t of tags) {
    const v = extractFirst(t, xml);
    if (v) return v;
  }
  return null;
}

function clean(s: string | null) {
  return String(s ?? "").trim();
}

function mapEtatToStatus(etatRaw: string | null): "submitted" | "accepted" | "rejected" {
  const e = clean(etatRaw).toUpperCase();

  if (
    e.includes("ACCEP") ||
    e.includes("VALI") ||
    e === "OK" ||
    e === "ACCEPTED" ||
    e === "VALIDATED" ||
    e === "V"
  ) {
    return "accepted";
  }

  if (
    e.includes("REJET") ||
    e.includes("REFUS") ||
    e.includes("ERREUR") ||
    e === "KO" ||
    e === "REJECTED" ||
    e === "R"
  ) {
    return "rejected";
  }

  return "submitted";
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id,company_id,ttn_save_id,ttn_generated_ref,ttn_reference,ttn_status")
      .eq("id", id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json(
        { ok: false, error: invErr?.message ?? "INVOICE_NOT_FOUND" },
        { status: 404 }
      );
    }

    const { data: ttn, error: ttnErr } = await supabase
      .from("company_ttn_settings")
      .select("ws_url, ws_login, ws_password, ttn_matricule")
      .eq("company_id", invoice.company_id)
      .maybeSingle();

    if (ttnErr) {
      return NextResponse.json({ ok: false, error: ttnErr.message }, { status: 500 });
    }

    if (!ttn?.ws_login || !ttn?.ws_password) {
      return NextResponse.json({ ok: true, mode: "no_webservice", invoice });
    }

    const cfg: TTNWebserviceConfig = {
      url: String(ttn.ws_url || "https://elfatoora.tn/ElfatouraServices/EfactService"),
      login: String(ttn.ws_login),
      password: String(ttn.ws_password),
      matricule: String(ttn.ttn_matricule || ""),
    };

    if (!invoice.ttn_save_id && !invoice.ttn_generated_ref && !invoice.ttn_reference) {
      return NextResponse.json(
        { ok: false, error: "Aucune référence TTN pour consulter la facture." },
        { status: 400 }
      );
    }

    const soap = await consultEfactSOAP(cfg, {
      idSaveEfact: (invoice as any).ttn_save_id || undefined,
      generatedRef: (invoice as any).ttn_generated_ref || undefined,
      documentNumber: undefined,
    });

    const raw = soap.raw;

    const generatedRef =
      extractAny(["generatedRef", "generatedREF", "GeneratedRef"], raw) || null;

    const etat =
      extractAny(
        ["etat", "ETAT", "etatEfact", "ETATEFACT", "state", "STATUS", "status"],
        raw
      ) || null;

    const message =
      extractAny(
        ["message", "Message", "libelle", "LIBELLE", "errorMessage", "ERRORMESSAGE"],
        raw
      ) || null;

    const mapped = mapEtatToStatus(etat);

    const patch: any = { ttn_status: mapped };

    if (generatedRef && generatedRef !== (invoice as any).ttn_generated_ref) {
      patch.ttn_generated_ref = generatedRef;
      patch.ttn_reference = generatedRef;
    }

    if (mapped === "accepted") {
      patch.ttn_validated_at = new Date().toISOString();
      patch.ttn_last_error = null;
    } else if (mapped === "rejected") {
      patch.ttn_last_error = clean(message || etat || "REJECTED").slice(0, 4000);
    }

    await supabase.from("invoices").update(patch).eq("id", (invoice as any).id);

    return NextResponse.json({
      ok: soap.ok,
      http_status: soap.status,
      generatedRef,
      etat,
      mapped_status: mapped,
      message,
      raw,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? "SERVER_ERROR") },
      { status: 500 }
    );
  }
}
