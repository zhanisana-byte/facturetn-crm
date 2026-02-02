import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const full_name = String(body?.full_name || "").trim();
    const user_id_from_client = body?.user_id ? String(body.user_id) : null;

    const { data: auth } = await supabase.auth.getUser();
    const authedUserId = auth?.user?.id ?? null;

    const userId = authedUserId || user_id_from_client;

    if (!userId) {
      return NextResponse.json({
        ok: true,
        note: "No session yet (email confirmation). Setup will be completed on callback.",
      });
    }

    const { error: upErr } = await supabase.from("app_users").upsert(
      {
        id: userId,
        email,
        full_name: full_name || null,
        account_type: "profil",
        role: "user",
        is_active: true,
      },
      { onConflict: "id" }
    );

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
    }

    const { error: wsErr } = await supabase.from("user_workspace").upsert(
      {
        user_id: userId,
        active_mode: "profil",
        active_company_id: null,
        active_group_id: null,
      },
      { onConflict: "user_id" }
    );

    if (wsErr) {
      return NextResponse.json({ ok: false, error: wsErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
