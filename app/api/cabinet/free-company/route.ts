import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCabinetContext } from "@/lib/accountant/cabinet-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await resolveCabinetContext(supabase, auth.user.id);
  if (!ctx?.cabinetGroupId) {
    return NextResponse.json({ error: "Cabinet introuvable." }, { status: 400 });
  }

  const form = await req.formData();
  const mf = String(form.get("mf") || "").trim();
  const company_id = String(form.get("company_id") || "").trim();

  if (!mf || !company_id) {
    return NextResponse.json({ error: "MF et ID société sont obligatoires." }, { status: 400 });
  }

  // Vérifier existence société (évite des ids invalides)
  const { data: company, error: cErr } = await supabase
    .from("companies")
    .select("id")
    .eq("id", company_id)
    .maybeSingle();

  if (cErr || !company?.id) {
    return NextResponse.json({ error: "Société introuvable (ID invalide)." }, { status: 400 });
  }

  // Upsert : une demande active par (user_id, group_id, company_id)
  const { error } = await supabase
    .from("cabinet_free_company_requests")
    .insert({
      user_id: auth.user.id,
      group_id: ctx.cabinetGroupId,
      mf,
      company_id,
      status: "pending",
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
