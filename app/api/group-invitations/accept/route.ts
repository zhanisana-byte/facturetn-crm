import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeParseObjective(objective: string | null) {
  try {
    if (!objective) return null;
    const j = JSON.parse(objective);
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });

  const { data: inv, error: invErr } = await supabase
    .from("group_invitations")
    .select("id, group_id, role, status, expires_at, invited_email, objective")
    .eq("token", token)
    .maybeSingle();

  if (invErr || !inv) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });

  const { data: profile } = await supabase
    .from("app_users")
    .select("email")
    .eq("id", auth.user.id)
    .maybeSingle();

  const myEmail = String(profile?.email || auth.user.email || "").toLowerCase();
  if (!myEmail || myEmail !== String(inv.invited_email || "").toLowerCase()) {
    return NextResponse.json({ error: "Cette invitation ne correspond pas à votre email." }, { status: 403 });
  }

  if (inv.status !== "pending") return NextResponse.json({ error: `Invitation déjà ${inv.status}` }, { status: 400 });

  if (inv.expires_at && new Date(inv.expires_at).getTime() < Date.now()) {
    await supabase.from("group_invitations").update({ status: "expired" }).eq("id", inv.id);
    return NextResponse.json({ error: "Invitation expirée." }, { status: 400 });
  }

  const { error: updInv } = await supabase
    .from("group_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      invited_user_id: auth.user.id,
    })
    .eq("id", inv.id);

  if (updInv) return NextResponse.json({ error: updInv.message }, { status: 400 });

  const svc = createServiceClient();

  const obj = safeParseObjective(inv.objective ?? null);
  const manage_companies_scope = String(obj?.manage_companies_scope || "none");
  const manage_company_ids = Array.isArray(obj?.manage_company_ids) ? obj.manage_company_ids : [];

  const role = String(inv.role || "staff");
  const safeRole = role === "owner" ? "admin" : (["admin", "staff"].includes(role) ? role : "staff");

  const permissions = {
    manage_companies_scope: ["none", "all", "selected"].includes(manage_companies_scope) ? manage_companies_scope : "none",
    manage_company_ids: manage_companies_scope === "selected" ? manage_company_ids : [],
  };

  const { error: gmErr } = await svc
    .from("group_members")
    .upsert(
      {
        group_id: inv.group_id,
        user_id: auth.user.id,
        role: safeRole,
        is_active: true,
        permissions,
      },
      { onConflict: "group_id,user_id" }
    );

  if (gmErr) return NextResponse.json({ error: gmErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, group_id: inv.group_id });
}
