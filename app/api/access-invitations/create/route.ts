import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

function token() {
  // URL-safe token
  return crypto.randomBytes(24).toString("base64url");
}

type InviteKind = "client_management" | "page_management";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const company_id = String(body.company_id || "");
  const invited_email = String(body.invited_email || "").trim().toLowerCase();
  const objective = String(body.objective || "").trim() as InviteKind;

  if (!company_id || !invited_email) {
    return NextResponse.json(
      { error: "company_id et invited_email requis" },
      { status: 400 }
    );
  }

  // ✅ Objectif stable (selon tes règles)
  if (objective !== "client_management" && objective !== "page_management") {
    return NextResponse.json(
      { error: "objective invalide (client_management | page_management)" },
      { status: 400 }
    );
  }

  // ✅ Rôle compatible avec l’objectif
  const role =
    String(body.role || "").trim() ||
    (objective === "page_management" ? "admin" : "accountant");

  if (objective === "page_management" && !["owner", "admin"].includes(role)) {
    return NextResponse.json(
      { error: "Pour gestion page, role doit être owner ou admin." },
      { status: 400 }
    );
  }

  // Permissions (uniquement client_management)
  const can_manage_customers = objective === "client_management" ? !!body.can_manage_customers : false;
  const can_create_invoices = objective === "client_management" ? !!body.can_create_invoices : false;
  const can_validate_invoices = objective === "client_management" ? !!body.can_validate_invoices : false;
  const can_submit_ttn = objective === "client_management" ? !!body.can_submit_ttn : false;

  const payload = {
    company_id,
    invited_email,
    invited_by_user_id: auth.user.id,
    objective,
    role: role as any,
    can_manage_customers,
    can_create_invoices,
    can_validate_invoices,
    can_submit_ttn,
    token: token(),
    status: "pending",
  };

  const { data, error } = await supabase
    .from("access_invitations")
    .insert(payload as any)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
