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

    if (!company_name) {
      return NextResponse.json({ ok: false, error: "company_name required" }, { status: 400 });
    }

    // (Optionnel) lire profile pour appliquer ta règle client/cabinet/groupe
    const { data: profile, error: pErr } = await supabase
      .from("app_users")
      .select("account_type,max_companies")
      .eq("id", auth.user.id)
      .single();

    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 });
    }

    // ✅ Bloquer si max_companies = 1 et déjà 1 société
    if ((profile?.max_companies ?? 1) <= 1) {
      const { count } = await supabase
        .from("companies")
        .select("id", { count: "exact", head: true })
        .eq("owner_user", auth.user.id);

      if ((count ?? 0) >= 1) {
        return NextResponse.json(
          { ok: false, error: "Limite atteinte: création de société non autorisée." },
          { status: 403 }
        );
      }
    }

    const { data: comp, error: cErr } = await supabase
      .from("companies")
      .insert({
        company_name,
        tax_id,
        owner_user: auth.user.id,
        origin: "direct",
      })
      .select("*")
      .single();

    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, company: comp }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
