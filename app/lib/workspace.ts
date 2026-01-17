
import { createClient } from "@/lib/supabase/server";

export async function getWorkspace() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_workspace")
    .select("*")
    .maybeSingle();

  return data ?? { active_mode: "profil" };
}
