import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const supabase = createServiceClient();
  const body = await req.json().catch(() => ({}));
  const token = s(body.token);
  const signed_xml = s(body.signed_xml);
  const cert = body.cert ?? {};

  if (!token || !signed_xml) {
    return NextResponse.json({ ok: false, error: "TOKEN_OR_XML_MISSING" }, { status: 400 });
  }

  const { data: t, error: tErr } = await supabase
    .from("signature_sign_tokens")
    .select("id, token, invoice_id, company_id, environment, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (tErr || !t) return NextResponse.json({ ok: false, error: "INVALID_TOKEN" }, { status: 400 });
  if (t.used_at) return NextResponse.json({ ok: false, error: "TOKEN_ALREADY_USED" }, { status: 400 });
  if (new Date(String(t.expires_at)).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "TOKEN_EXPIRED" }, { status: 400 });
  }

  const invoice_id = String(t.invoice_id);
  const company_id = String(t.company_id);
  const environment = (String(t.environment) || "production") as "test" | "production";

  // Store signed XML
  const { error: upErr } = await supabase
    .from("invoice_signatures")
    .upsert(
      {
        invoice_id,
        company_id,
        environment,
        provider: "usb_agent",
        signed_xml,
        cert_serial: s(cert.serial_number) || null,
        cert_subject: s(cert.subject) || null,
        meta: {
          thumbprint: s(cert.thumbprint) || null,
          issuer: s(cert.issuer) || null,
        },
      },
      { onConflict: "invoice_id" }
    );

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  await supabase
    .from("signature_sign_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", t.id);

  return NextResponse.json({ ok: true, invoice_id, company_id, environment });
}
