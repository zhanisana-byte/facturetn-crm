import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/profile/settings";

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const user = auth.user;
  const email = user.email ?? "";
  const fullName = (user.user_metadata?.full_name as string) || null;

  // crée app_users si absent
  const { data: existing } = await supabase
    .from("app_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("app_users").insert({
      id: user.id,
      email,
      full_name: fullName,
      account_type: "profil",
      role: "user",
      is_active: true,
    });

    if (error) {
      // si RLS est OK, ça doit passer
      console.error("create app_users error", error);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
