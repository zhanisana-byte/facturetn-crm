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
  const company_id = s(body.company_id);
  const environment = (s(body.environment) || "production") as "test" | "production";
  const cert = body.cert ?? {};

  if (!token || !company_id) {
    return NextResponse.json({ ok: false, error: "TOKEN_OR_COMPANY_MISSING" }, { status: 400 });
  }

  // 1) Valider token
  const { data: t, error: tErr } = await supabase
    .from("signature_pair_tokens")
    .select("id, token, company_id, environment, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (tErr || !t) {
    return NextResponse.json({ ok: false, error: "INVALID_TOKEN" }, { status: 400 });
  }
  if (String(t.company_id) !== company_id || String(t.environment) !== environment) {
    return NextResponse.json({ ok: false, error: "TOKEN_MISMATCH" }, { status: 400 });
  }
  if (t.used_at) {
    return NextResponse.json({ ok: false, error: "TOKEN_ALREADY_USED" }, { status: 400 });
  }
  if (new Date(String(t.expires_at)).getTime() < Date.now()) {
    return NextResponse.json({ ok: false, error: "TOKEN_EXPIRED" }, { status: 400 });
  }

  // 2) Upsert ttn_credentials signature provider
  const signature_config = {
    usb_agent: {
      thumbprint: s(cert.thumbprint) || null,
      serial_number: s(cert.serial_number) || null,
      subject: s(cert.subject) || null,
      issuer: s(cert.issuer) || null,
      not_before: cert.not_before ?? null,
      not_after: cert.not_after ?? null,
    },
  };

  const { error: upErr } = await supabase
    .from("ttn_credentials")
    .upsert(
      {
        company_id,
        environment,
        signature_provider: "usb_agent",
        signature_status: "paired",
        signature_config,
        require_signature: true,
      },
      { onConflict: "company_id,environment" }
    );

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  // 3) Mark token used
  await supabase
    .from("signature_pair_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", t.id);

  return NextResponse.json({ ok: true });
}
