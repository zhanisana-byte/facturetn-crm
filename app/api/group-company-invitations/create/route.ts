import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const group_id = String(body.group_id || "").trim();
  const invited_email = String(body.invited_email || "").trim().toLowerCase();
  const company_id = String(body.company_id || "").trim();
  const company_tax_id = String(body.company_tax_id || "").trim();

  if (!group_id) return NextResponse.json({ error: "group_id requis" }, { status: 400 });
  if (!invited_email) return NextResponse.json({ error: "invited_email requis" }, { status: 400 });
  if (!company_id && !company_tax_id) {
    return NextResponse.json({ error: "company_id ou company_tax_id requis" }, { status: 400 });
  }

  // Check group access (owner/admin)
  const { data: gm } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", group_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const isGroupAdmin = gm?.role === "owner" || gm?.role === "admin";
  if (!isGroupAdmin) {
    const { data: g } = await supabase.from("groups").select("owner_user_id").eq("id", group_id).maybeSingle();
    if (!g || g.owner_user_id !== auth.user.id) {
      return NextResponse.json({ error: "Accès groupe refusé" }, { status: 403 });
    }
  }

  // Resolve company
  let compId = company_id;
  if (!compId) {
    const { data: c, error: ce } = await supabase
      .from("companies")
      .select("id")
      .eq("tax_id", company_tax_id)
      .maybeSingle();
    if (ce) return NextResponse.json({ error: ce.message }, { status: 400 });
    if (!c?.id) return NextResponse.json({ error: "Société introuvable (tax_id)" }, { status: 404 });
    compId = c.id;
  }

  // Prevent duplicates: already linked?
  const { data: existingLink } = await supabase
    .from("group_companies")
    .select("id,link_type")
    .eq("group_id", group_id)
    .eq("company_id", compId)
    .maybeSingle();

  if (existingLink?.id) {
    return NextResponse.json({ error: "Société déjà liée au groupe." }, { status: 409 });
  }

  const { data: inserted, error } = await supabase
    .from("group_company_invitations")
    .insert({
      group_id,
      company_id: compId,
      invited_email,
      created_by_user_id: auth.user.id,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: inserted?.id });
}
