import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    const company_name = String(body?.company_name ?? "").trim();
    const tax_id = String(body?.tax_id ?? "").trim() || null;

    const address = String(body?.address ?? "").trim() || null;
    const email = String(body?.email ?? "").trim() || null;
    const phone = String(body?.phone ?? "").trim() || null;

    if (!company_name) {
      return NextResponse.json({ ok: false, error: "company_name required" }, { status: 400 });
    }

    const { data: profile, error: pErr } = await supabase
      .from("app_users")
      .select("max_companies")
      .eq("id", auth.user.id)
      .single();

    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 });
    }

    const max = profile?.max_companies ?? 1;

    if (max <= 1) {
      const { count } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_id", auth.user.id);

      if ((count ?? 0) >= 1) {
        return NextResponse.json(
          { ok: false, error: "Limite atteinte: une seule société autorisée." },
          { status: 403 }
        );
      }
    }

    const { data: comp, error: cErr } = await supabase
      .from("companies")
      .insert({
        company_name,
        tax_id,
        address,
        email,
        phone,
        owner_user_id: auth.user.id,
})
      .select("*")
      .single();

    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 });
    }

    try {
      await supabase.from("memberships").upsert(
        {
          company_id: comp.id,
          user_id: auth.user.id,
          role: "owner",
          can_manage_customers: true,
          can_create_invoices: true,
          can_validate_invoices: true,
          can_submit_ttn: true,
          is_active: true,
        } as any,
        { onConflict: "company_id,user_id" } as any
      );
    } catch {
      
    }

    return NextResponse.json({ ok: true, company: comp }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
