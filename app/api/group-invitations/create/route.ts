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

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const group_id = String(body.group_id || "").trim();
  const invited_email = String(body.invited_email || "").trim().toLowerCase();
  const role = String(body.role || "staff").trim();
  const objective = String(body.objective || "").trim();

  if (!group_id) return NextResponse.json({ error: "group_id requis" }, { status: 400 });
  if (!invited_email || !invited_email.includes("@")) return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  if (!["owner", "admin", "staff"].includes(role)) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .select("owner_user_id")
    .eq("id", group_id)
    .maybeSingle();

  if (groupErr) return NextResponse.json({ error: groupErr.message }, { status: 400 });

  const isOwner = group?.owner_user_id === auth.user.id;
  if (!isOwner) {
    return NextResponse.json({ error: "Accès refusé (owner requis)" }, { status: 403 });
  }

  const { data: invitedUser } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", invited_email)
    .maybeSingle();

  const payload: any = {
    group_id,
    invited_email,
    invited_by_user_id: auth.user.id,
    role,
    objective: objective || null,
    token: token(),
    status: "pending",
    invited_user_id: invitedUser?.id ?? null,
  };

  const { data, error } = await supabase
    .from("group_invitations")
    .insert(payload)
    .select("id, token")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (!data?.token) {
    return NextResponse.json({ error: "INVITE_CREATE_FAILED" }, { status: 500 });
  }

  const originFromReq = (() => {
    try {
      return new URL((req as any).url).origin;
    } catch {
      return "";
    }
  })();

  let base =
    (typeof getPublicBaseUrl === "function" ? getPublicBaseUrl() : "") ||
    (process.env.NEXT_PUBLIC_SITE_URL || originFromReq || "").trim();

  if (base && !/^https?:\/\
  base = base.replace(/\/+$/, "");

  const inviteLink = `${base}/groups/${group_id}/invitations?token=${encodeURIComponent(data.token)}`;

  try {
    await sendEmailResend({
      to: invited_email,
      subject: "Invitation Groupe — FactureTN",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <p>Bonjour,</p>
          <p>Vous avez reçu une invitation sur FactureTN.</p>
          <p><a href="${inviteLink}">Ouvrir l’invitation</a></p>
          <p style="color:#6b7280;font-size:12px;margin-top:24px">
            Si le bouton ne marche pas, copiez/collez ce lien :<br/>${inviteLink}
          </p>
        </div>
      `,
    });
  } catch {
    
  }

  return NextResponse.json({ ok: true, inviteLink });
}
