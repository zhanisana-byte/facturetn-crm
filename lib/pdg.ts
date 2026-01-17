import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requirePDG() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,email,full_name,is_platform_pdg")
    .eq("id", auth.user.id)
    .single();

  if (!profile || !profile.is_platform_pdg) redirect("/dashboard");
  return { user: auth.user, profile };
}
