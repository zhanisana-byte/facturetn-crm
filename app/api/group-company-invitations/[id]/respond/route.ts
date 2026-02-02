import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Body = { action: "accept" | "decline" | "revoke" };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const invitationId = String(id || "").trim();

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = null;
  }
  const action = String(body?.action ?? "").trim() as Body["action"];
  if (!["accept", "decline", "revoke"].includes(action)) {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const { data: inv } = await supabase
    .from("group_company_invitations")
    .select("id,group_id,company_id,invited_email,invited_user_id,status,created_by_user_id")
    .eq("id", invitationId)
    .maybeSingle();

  if (!inv?.id) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });

  const currentStatus = String((inv as any).status || "pending");
  if (currentStatus !== "pending" && action !== "revoke") {
    return NextResponse.json({ error: "Invitation déjà traitée." }, { status: 400 });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, owner_user_id")
    .eq("id", (inv as any).company_id)
    .maybeSingle();
  const isCompanyOwner = company?.id && String((company as any).owner_user_id) === auth.user.id;

  const { data: group } = await supabase
    .from("groups")
    .select("id, owner_user_id")
    .eq("id", (inv as any).group_id)
    .maybeSingle();

  const { data: gm } = await supabase
    .from("group_members")
    .select("role,is_active")
    .eq("group_id", (inv as any).group_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const isGroupOwner = group?.id && String((group as any).owner_user_id) === auth.user.id;
  const isGroupAdmin = !!(gm?.is_active && ["owner", "admin"].includes(String((gm as any).role)));

  const myEmail = String((auth.user.email ?? "")).toLowerCase();
  const invitedEmail = String((inv as any).invited_email ?? "").toLowerCase();
  const isInvitedEmail = !!(myEmail && invitedEmail && myEmail === invitedEmail);

  if (action === "revoke") {
    if (!isCompanyOwner && !isGroupOwner && !isGroupAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    if (!isGroupOwner && !isGroupAdmin && !isInvitedEmail) {
      return NextResponse.json({ error: "Seul Owner/Admin du groupe (ou l'email invité) peut accepter/refuser." }, { status: 403 });
    }
  }

  if (action === "accept") {
    
    const { error: linkErr } = await supabase
      .from("group_companies")
      .upsert(
        {
          group_id: (inv as any).group_id,
          company_id: (inv as any).company_id,
          link_type: "external",
          added_by_user_id: auth.user.id,
        },
        { onConflict: "group_id,company_id" }
      );

    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 });

    const { error: upErr } = await supabase
      .from("group_company_invitations")
      .update({
        status: "accepted",
        invited_user_id: (inv as any).invited_user_id ?? auth.user.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", invitationId);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

    return NextResponse.json({ ok: true, status: "accepted" });
  }

  if (action === "decline") {
    const { error: upErr } = await supabase
      .from("group_company_invitations")
      .update({
        status: "declined",
        invited_user_id: (inv as any).invited_user_id ?? auth.user.id,
        responded_at: new Date().toISOString(),
      })
      .eq("id", invitationId);

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
    return NextResponse.json({ ok: true, status: "declined" });
  }

  const { error: upErr } = await supabase
    .from("group_company_invitations")
    .update({
      status: "revoked",
      responded_at: new Date().toISOString(),
    })
    .eq("id", invitationId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ ok: true, status: "revoked" });
}
