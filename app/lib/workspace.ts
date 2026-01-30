
import { createClient } from "@/lib/supabase/server";

export async function getWorkspace() {
  const supabase = await createClient();
  // ⚡ Ne récupère que le strict nécessaire (payload plus léger)
  const { data } = await supabase
    .from("user_workspace")
    .select("active_mode, active_company_id, active_group_id")
    .maybeSingle();

  return data ?? { active_mode: "profil" };
}
