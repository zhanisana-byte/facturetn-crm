import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const email = (auth.user.email || "").toLowerCase();

  const { data: inv, error: invErr } = await supabase
    .from("group_company_invitations")
    .select("id,group_id,company_id,invited_email,status")
    .eq("id", id)
    .maybeSingle();

  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 400 });
  if (!inv) return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
  if (inv.status !== "pending") return NextResponse.json({ error: "Invitation déjà traitée" }, { status: 409 });
  if ((inv.invited_email || "").toLowerCase() !== email) {
    return NextResponse.json({ error: "Email invité ne correspond pas" }, { status: 403 });
  }

  const { data: c } = await supabase
    .from("companies")
    .select("id,owner_user")
    .eq("id", inv.company_id)
    .maybeSingle();

  const isOwnerCompany = c?.owner_user === auth.user.id;

  let isAdminCompany = false;
  if (!isOwnerCompany) {
    const { data: m } = await supabase
      .from("memberships")
      .select("role")
      .eq("company_id", inv.company_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    isAdminCompany = m?.role === "owner" || m?.role === "admin";
  }

  if (!isOwnerCompany && !isAdminCompany) {
    return NextResponse.json(
      { error: "Vous n'avez pas le droit de lier cette société (owner/admin requis)." },
      { status: 403 }
    );
  }

  const { error: linkErr } = await supabase.from("group_companies").insert({
    group_id: inv.group_id,
    company_id: inv.company_id,
    link_type: "external",
    added_by_user_id: auth.user.id,
  });

  if (linkErr && !String(linkErr.message || "").toLowerCase().includes("duplicate")) {
    return NextResponse.json({ error: linkErr.message }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("group_company_invitations")
    .update({
      status: "accepted",
      invited_user_id: auth.user.id,
      responded_at: new Date().toISOString(),
    })
    .eq("id", inv.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const team = body.team && typeof body.team === "object" ? body.team : null;
  if (team) {
    const mode = String(team.mode || "all").toLowerCase() === "selected" ? "selected" : "all";
    const companyPerms =
      team.company_permissions && typeof team.company_permissions === "object" ? team.company_permissions : {};

    let targetMemberIds: string[] = [];

    if (mode === "all") {
      const { data: ms, error: msErr } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", inv.group_id)
        .eq("is_active", true);

      if (msErr) return NextResponse.json({ error: msErr.message }, { status: 400 });
      targetMemberIds = (ms ?? []).map((x: any) => String(x.id));
    } else {
      const ids = Array.isArray(team.group_member_ids) ? team.group_member_ids.map(String) : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: "Sélection vide : choisissez au moins un membre." }, { status: 400 });
      }
      
      const { data: ms, error: msErr } = await supabase
        .from("group_members")
        .select("id")
        .eq("group_id", inv.group_id)
        .in("id", ids);

      if (msErr) return NextResponse.json({ error: msErr.message }, { status: 400 });
      targetMemberIds = (ms ?? []).map((x: any) => String(x.id));
    }

    const companyId = String(inv.company_id);

    for (const gmId of targetMemberIds) {
      const { data: gm, error: gmErr } = await supabase
        .from("group_members")
        .select("id,permissions")
        .eq("id", gmId)
        .eq("group_id", inv.group_id)
        .maybeSingle();

      if (gmErr) return NextResponse.json({ error: gmErr.message }, { status: 400 });
      if (!gm?.id) continue;

      const p = gm.permissions && typeof gm.permissions === "object" ? gm.permissions : {};
      const companies = p.companies && typeof p.companies === "object" ? p.companies : {};
      companies[companyId] = { ...(companies[companyId] || {}), ...companyPerms };

      const currentMode = String(p.company_access || p.companyAccess || "selected").toLowerCase();
      const keepAll = currentMode === "all";

      let nextMode = keepAll ? "all" : "selected";
      let allowedIds: string[] = Array.isArray(p.allowed_company_ids || p.allowedCompanyIds)
        ? (p.allowed_company_ids || p.allowedCompanyIds).map(String)
        : [];

      if (!keepAll) {
        if (!allowedIds.includes(companyId)) allowedIds.push(companyId);
      }

      const nextPerms = {
        ...p,
        company_access: nextMode,
        allowed_company_ids: allowedIds,
        companies,
      };

      const { error: saveErr } = await supabase
        .from("group_members")
        .update({ permissions: nextPerms, updated_at: new Date().toISOString() })
        .eq("id", gmId)
        .eq("group_id", inv.group_id);

      if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
