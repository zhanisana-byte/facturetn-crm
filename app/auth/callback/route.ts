import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase email confirmation / magic link callback.
 * - Exchanges ?code=... for a session (sets auth cookies)
 * - Ensures app_users + user_workspace exist (Profil by default)
 * - Copies country_code from user_metadata into app_users.country_code
 * - Redirects to ?next=... (default: /profile/settings)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/profile/settings";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supabase = await createClient();

  // 1) Create session cookies
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=auth_callback_failed", url.origin));
  }

  // 2) Get authed user
  const { data: authData, error: userErr } = await supabase.auth.getUser();
  const user = authData?.user;

  if (userErr || !user) {
    return NextResponse.redirect(new URL("/login?error=user_missing_after_callback", url.origin));
  }

  const email = (user.email || "").toLowerCase().trim();
  const fullName =
    (user.user_metadata?.full_name && String(user.user_metadata.full_name).trim()) || null;

  const countryCodeRaw =
    (user.user_metadata?.country_code && String(user.user_metadata.country_code).trim()) || "TN";
  const country_code = countryCodeRaw === "FR" ? "FR" : "TN";

  // 3) Ensure app_users exists (FORCE profil)
  const { error: upErr } = await supabase.from("app_users").upsert(
    {
      id: user.id,
      email,
      full_name: fullName,
      account_type: "profil",
      role: "user",
      is_active: true,
      country_code, // ✅ AJOUT
    },
    { onConflict: "id" }
  );

  if (upErr) {
    return NextResponse.redirect(
      new URL(
        `/login?error=app_users_upsert_failed&msg=${encodeURIComponent(upErr.message)}`,
        url.origin
      )
    );
  }

  // 4) Ensure user_workspace exists (FORCE profil)
  const { error: wsErr } = await supabase.from("user_workspace").upsert(
    {
      user_id: user.id,
      active_mode: "profil",
      active_company_id: null,
      active_group_id: null,
    },
    { onConflict: "user_id" }
  );

  if (wsErr) {
    return NextResponse.redirect(
      new URL(
        `/login?error=user_workspace_upsert_failed&msg=${encodeURIComponent(wsErr.message)}`,
        url.origin
      )
    );
  }

  // 5) Redirect
  return NextResponse.redirect(new URL(next, url.origin));
}
