import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function token() {
  // URL-safe token
  return crypto.randomBytes(24).toString("base64url");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const company_id = String(body.company_id || "");
  const invited_email = String(body.invited_email || "").trim().toLowerCase();

  if (!company_id || !invited_email) {
    return NextResponse.json({ error: "company_id et invited_email requis" }, { status: 400 });
  }

  const payload = {
    company_id,
    invited_email,
    invited_by_user_id: auth.user.id,
    role: (body.role ?? "accountant") as any,
    can_manage_customers: !!body.can_manage_customers,
    can_create_invoices: body.can_create_invoices !== false,
    can_validate_invoices: !!body.can_validate_invoices,
    can_submit_ttn: !!body.can_submit_ttn,
    token: token(),
    status: "pending",
  };

  const { data, error } = await supabase
    .from("access_invitations")
    .insert(payload)
    .select("token, invited_email, company_id, status, expires_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Base URL robuste (évite liens sans https / sans domaine)
  const originFromReq = (() => {
    try {
      return new URL((req as any).url).origin;
    } catch {
      return "";
    }
  })();

  let base = (process.env.NEXT_PUBLIC_SITE_URL || originFromReq || "").trim();
  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/+$/, "");

  const inviteLink = `${base}/invitation/accept?token=${encodeURIComponent(data.token)}`;

  return NextResponse.json({ ok: true, invitation: data, inviteLink });
}
