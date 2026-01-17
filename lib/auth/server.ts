import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const getSupabase = cache(async () => {
  return await createClient();
});

export const getAuthUser = cache(async () => {
  const supabase = await getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  return { supabase, user: auth.user };
});

export const getAppUser = cache(async () => {
  const { supabase, user } = await getAuthUser();
  const { data, error } = await supabase
    .from("app_users")
    .select("id,email,full_name,account_type,plan_code,max_companies,subscription_status")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return { supabase, user, profile: null as any };
  }
  return { supabase, user, profile: data };
});
