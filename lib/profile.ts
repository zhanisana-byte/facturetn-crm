import { createClient } from "@/lib/supabase/server";

export async function getProfile() {
  const supabase = await createClient();

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return null;

  const user = auth?.user;
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) return null;
  return profile;
}
