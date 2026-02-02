import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";
import { sendEmailResend } from "@/lib/email/sendEmail";
import { getPublicBaseUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function token() {
  
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

  if (objective !== "client_management" && objective !== "page_management") {
    return NextResponse.json(
      { error: "objective invalide (client_management | page_management)" },
      { status: 400 }
    );
  }

  const rawRole = String(body.role || "").trim() || (objective === "page_management" ? "staff" : "accountant");

  const role = (() => {
    const r = rawRole.toLowerCase();
    if (objective === "page_management") {
      if (r === "owner") return "owner";
      if (r === "admin" || r === "staff") return "staff";
      
      return "staff";
    }
    
    if (r === "accountant" || r === "comptable") return "accountant";
    if (r === "viewer") return "viewer";
    if (r === "staff" || r === "admin") return "staff";
    return "accountant";
  })();

  if (objective === "page_management" && !["owner", "staff"].includes(role)) {
    return NextResponse.json(
      { error: "Pour gestion page, role doit être owner ou admin." },
      { status: 400 }
    );
  }

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

const base = getPublicBaseUrl().replace(/\/+$/, "");
const inviteLink = `${base}/access/accept/${encodeURIComponent(data.token)}`;

try {
  await sendEmailResend({
    to: data.to_email,
    subject: "Invitation d’accès — FactureTN",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <p>Bonjour,</p>
        <p>Vous avez reçu une invitation d’accès sur FactureTN.</p>
        <p><a href="${inviteLink}">Cliquez ici pour accepter l’invitation</a></p>
        <p style="color:#6b7280;font-size:12px;margin-top:24px">Si le bouton ne marche pas, copiez/collez ce lien :<br/>${inviteLink}</p>
      </div>
    `,
  });
} catch {
  
}

return NextResponse.json({ ok: true, invitation: data, inviteLink });
}
