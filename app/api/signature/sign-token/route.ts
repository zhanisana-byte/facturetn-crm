import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCompanyAction } from "@/lib/permissions/companyPerms";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function s(v: any) {
  return String(v ?? "").trim();
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const invoice_id = s(body.invoice_id);
  const environment = (s(body.environment) || "production") as "test" | "production";
  if (!invoice_id) return NextResponse.json({ ok: false, error: "invoice_id required" }, { status: 400 });

  // Load invoice to get company_id
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .select("id,company_id")
    .eq("id", invoice_id)
    .maybeSingle();

  const company_id = String((invoice as any)?.company_id || "");
  if (invErr || !invoice || !company_id) {
    return NextResponse.json({ ok: false, error: "INVOICE_NOT_FOUND" }, { status: 404 });
  }

  const ok = await canCompanyAction(supabase, auth.user.id, company_id, "submit_ttn");
  if (!ok) return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });

    // DSS/DigiGo: signer must view invoice before signing
  const { data: viewRow } = await supabase
    .from("invoice_signature_views")
    .select("id")
    .eq("invoice_id", invoice_id)
    .eq("viewed_by", auth.user.id)
    .maybeSingle();

  if (!viewRow) {
    return NextResponse.json(
      { ok: false, error: "MUST_VIEW_INVOICE" },
      { status: 409 }
    );
  }

const token = crypto.randomUUID();
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error } = await supabase.from("signature_sign_tokens").insert({
    token,
    invoice_id,
    company_id,
    environment,
    created_by: auth.user.id,
    expires_at,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const h = new Headers(req.headers);
  const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
  const server = (process.env.NEXT_PUBLIC_APP_URL || (host ? `${proto}://${host}` : "")).replace(/\/$/, "");
  if (!server) return NextResponse.json({ ok: false, error: "SERVER_URL_MISSING" }, { status: 500 });

  const scheme = (process.env.AGENT_DEEPLINK_SCHEME || "facturetn-agent").trim();
  const deepLinkUrl = `${scheme}://sign?server=${encodeURIComponent(server)}&token=${encodeURIComponent(token)}`;

  return NextResponse.json({ ok: true, token, deepLinkUrl, expires_at });
}
