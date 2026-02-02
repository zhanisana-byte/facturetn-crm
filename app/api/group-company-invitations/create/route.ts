import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = {
  companyId: string;
  groupId: string;
  kind?: "group" | "cabinet"; 
  inviteEmail?: string; 
};

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = null;
  }
  const companyId = String(body?.companyId ?? "").trim();
  const groupId = String(body?.groupId ?? "").trim();
  const kind = (body?.kind ?? "group") as "group" | "cabinet";
  const inviteEmailInput = String(body?.inviteEmail ?? "").trim().toLowerCase();

  if (!companyId || !groupId) {
    return NextResponse.json({ error: "companyId et groupId sont requis." }, { status: 400 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, owner_user_id")
    .eq("id", companyId)
    .maybeSingle();

  if (!company?.id) return NextResponse.json({ error: "Société introuvable." }, { status: 404 });
  if (String((company as any).owner_user_id) !== auth.user.id) {
    return NextResponse.json({ error: "Seul l'Owner de la société peut inviter un Groupe/Cabinet." }, { status: 403 });
  }

  const { data: group } = await supabase
    .from("groups")
    .select("id, group_name, group_type, owner_user_id")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) return NextResponse.json({ error: "Groupe/Cabinet introuvable." }, { status: 404 });

  const gtype = String((group as any).group_type ?? "multi");
  if (kind === "cabinet" && gtype !== "cabinet") {
    return NextResponse.json({ error: "Ce groupe n'est pas de type 'cabinet'." }, { status: 400 });
  }
  if (kind === "group" && gtype === "cabinet") {
    
  }

  let invited_email = inviteEmailInput;
  let invited_user_id: string | null = null;

  if (!invited_email) {
    const ownerId = String((group as any).owner_user_id ?? "");
    if (ownerId) {
      const { data: ownerUser } = await supabase.from("app_users").select("id,email").eq("id", ownerId).maybeSingle();
      invited_email = String((ownerUser as any)?.email ?? "").trim().toLowerCase();
      invited_user_id = ownerUser?.id ?? null;
    }
  } else {
    
    const { data: u } = await supabase.from("app_users").select("id,email").eq("email", invited_email).maybeSingle();
    invited_user_id = u?.id ?? null;

    if (invited_user_id) {
      
      const { data: gm } = await supabase
        .from("group_members")
        .select("role,is_active")
        .eq("group_id", groupId)
        .eq("user_id", invited_user_id)
        .maybeSingle();

      const ok =
        (String((group as any).owner_user_id) === invited_user_id) ||
        (gm?.is_active && ["owner", "admin"].includes(String((gm as any).role)));

      if (!ok) {
        return NextResponse.json(
          { error: "Cet email n'est pas Owner/Admin de ce groupe." },
          { status: 400 }
        );
      }
    }
  }

  if (!invited_email) {
    return NextResponse.json({ error: "Impossible de déterminer l'email de réception (Owner du groupe introuvable)." }, { status: 400 });
  }

  const { data: created, error } = await supabase
    .from("group_company_invitations")
    .insert({
      group_id: groupId,
      company_id: companyId,
      invited_email,
      invited_user_id,
      created_by_user_id: auth.user.id,
      status: "pending",
    })
    .select("id, status, invited_email, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, invitation: created });
}
