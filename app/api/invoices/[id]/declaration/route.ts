import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function readSignedXml(inv: any) {
  const rel = inv?.invoice_signatures;
  if (!rel) return null;
  if (Array.isArray(rel)) return rel?.[0]?.signed_xml || null;
  return rel?.signed_xml || null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const status = String(body.status || "").trim();
  const ref = typeof body.ref === "string" ? body.ref.trim() : null;
  const note = typeof body.note === "string" ? body.note.trim() : null;

  if (!id) return NextResponse.json({ ok: false, error: "ID_REQUIRED" }, { status: 400 });
  if (!["none", "manual"].includes(status)) {
    return NextResponse.json({ ok: false, error: "STATUS_INVALID" }, { status: 400 });
  }

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("id,company_id,document_type,ttn_status,invoice_signatures(signed_xml)")
    .eq("id", id)
    .maybeSingle();

  if (invErr) return NextResponse.json({ ok: false, error: invErr.message }, { status: 400 });
  if (!inv) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const docType = String(inv.document_type || "facture").toLowerCase();
  if (docType === "devis") return NextResponse.json({ ok: false, error: "DOC_NOT_ELIGIBLE" }, { status: 409 });

  const ttnStatus = String(inv.ttn_status || "not_sent");
  if (ttnStatus !== "not_sent") {
    return NextResponse.json({ ok: false, error: "INVOICE_LOCKED_TTN" }, { status: 409 });
  }

  const { data: settings, error: sErr } = await supabase
    .from("company_settings")
    .select("signature_required,validation_required")
    .eq("company_id", inv.company_id)
    .maybeSingle();

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 400 });

  const signatureRequired = Boolean(settings?.signature_required);
  const validationRequired = Boolean(settings?.validation_required);

  const { data: membership, error: mErr } = await supabase
    .from("memberships")
    .select("role,is_active,can_validate_invoices,can_create_invoices")
    .eq("company_id", inv.company_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 400 });

  const allowed =
    Boolean(membership?.is_active) &&
    (membership?.role === "owner" ||
      membership?.can_validate_invoices === true ||
      membership?.can_create_invoices === true);

  if (!allowed) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

  if (validationRequired) {
    const { data: inv2, error: inv2Err } = await supabase
      .from("invoices")
      .select("validated_at,status")
      .eq("id", id)
      .maybeSingle();

    if (inv2Err) return NextResponse.json({ ok: false, error: inv2Err.message }, { status: 400 });

    const validatedAt = inv2?.validated_at;
    const st = String(inv2?.status || "draft");
    if (!validatedAt && st !== "validated") {
      return NextResponse.json({ ok: false, error: "VALIDATION_REQUIRED" }, { status: 409 });
    }
  }

  const signedXml = readSignedXml(inv);
  if (signatureRequired && !signedXml) {
    return NextResponse.json({ ok: false, error: "SIGNATURE_REQUIRED" }, { status: 409 });
  }

  const payload: any = {};
  if (status === "none") {
    payload.declaration_status = "none";
    payload.declaration_ref = null;
    payload.declaration_note = null;
    payload.declared_at = null;
  } else {
    payload.declaration_status = "manual";
    payload.declaration_ref = ref;
    payload.declaration_note = note;
    payload.declared_at = new Date().toISOString();
  }

  const { error: upErr } = await supabase.from("invoices").update(payload).eq("id", id);
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
