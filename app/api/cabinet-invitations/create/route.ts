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
  const cabinet_group_id = String(body.cabinet_group_id || "").trim();
  const invited_email = String(body.invited_email || "").trim().toLowerCase();
  const role = String(body.role || "admin").trim();
  const objective = String(body.objective || "").trim();

  if (!cabinet_group_id) return NextResponse.json({ error: "cabinet_group_id requis" }, { status: 400 });
  if (!invited_email || !invited_email.includes("@")) return NextResponse.json({ error: "Email invalide" }, { status: 400 });
  if (!["owner", "admin"].includes(role)) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });

  // vérifier que c'est bien un cabinet
  const { data: g, error: gErr } = await supabase
    .from("groups")
    .select("id, group_type, owner_user_id")
    .eq("id", cabinet_group_id)
    .maybeSingle();

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 400 });

  if (!g?.id || g.group_type !== "cabinet") {
    return NextResponse.json({ error: "Cabinet introuvable." }, { status: 404 });
  }

  // permission: owner/admin du cabinet
  const isOwner = g.owner_user_id === auth.user.id;
  if (!isOwner) {
    const { data: gm, error: gmErr } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", cabinet_group_id)
      .eq("user_id", auth.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (gmErr) return NextResponse.json({ error: gmErr.message }, { status: 400 });

    if (!gm?.is_active || !["owner", "admin"].includes(String(gm.role).toLowerCase())) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
  }

  // invited_user_id (optionnel)
  const { data: invitedUser, error: invitedErr } = await supabase
    .from("app_users")
    .select("id")
    .eq("email", invited_email)
    .maybeSingle();

  if (invitedErr) {
    // pas bloquant: on continue quand même sans invited_user_id
  }

  const { data, error } = await supabase
    .from("group_invitations")
    .insert({
      group_id: cabinet_group_id,
      invited_email,
      invited_by_user_id: auth.user.id,
      role,
      objective: objective || null,
      token: token(),
      status: "pending",
      invited_user_id: invitedUser?.id ?? null,
    })
    .select("token")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ✅ Guard TS (corrige votre build)
  if (!data?.token) {
    return NextResponse.json({ error: "INVITE_CREATE_FAILED" }, { status: 500 });
  }

  // Base URL propre (utilise votre helper si possible)
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

  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
  base = base.replace(/\/+$/, "");

  const inviteLink = `${base}/accountant/invitations?token=${encodeURIComponent(data.token)}`;

  // Envoi email (Resend) - best effort
  try {
    await sendEmailResend({
      to: invited_email,
      subject: "Invitation Cabinet — FactureTN",
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
    // ignore
  }

  return NextResponse.json({ ok: true, inviteLink });
}
