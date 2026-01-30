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

    // Si on a une session (selon config), on prend auth.uid()
    const { data: auth } = await supabase.auth.getUser();
    const authedUserId = auth?.user?.id ?? null;

    // On décide l'id final
    const userId = authedUserId || user_id_from_client;

    // Si on n'a pas d'userId (cas confirmation email stricte),
    // on ne peut pas écrire app_users avec RLS.
    // => on répond OK quand même (le callback fera le setup après confirmation).
    if (!userId) {
      return NextResponse.json({
        ok: true,
        note: "No session yet (email confirmation). Setup will be completed on callback.",
      });
    }

    // 1) app_users: upsert
    // IMPORTANT: account_type = 'profil' (le bug venait de là)
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

    // 2) user_workspace: upsert
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
