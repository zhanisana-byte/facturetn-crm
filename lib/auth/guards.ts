import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DbAccountType } from "@/app/types";

export type AppUserLite = {
  id: string;
  email: string | null;
  account_type: DbAccountType | null;
  full_name: string | null;
  plan_code: string | null;
  max_companies: number | null;
};

export async function requireAuthUser() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  return { supabase, user: auth.user };
}

export async function requireAppUser(allowed?: DbAccountType[]) {
  const { supabase, user } = await requireAuthUser();

  const { data: profile, error } = await supabase
    .from("app_users")
    .select("id,email,account_type,full_name,plan_code,max_companies")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) redirect("/login");

  const p = profile as AppUserLite;

  if (allowed?.length) {
    const t = (p.account_type || "profil") as DbAccountType;
    if (!allowed.includes(t)) redirect("/dashboard");
  }

  return { supabase, user, profile: p };
}

export async function enforceSingleOwnedCompanyForEntreprise() {
  const { supabase, user, profile } = await requireAppUser(["entreprise", "profil", "multi_societe"]);

  if (profile.account_type !== "entreprise") return { supabase, user, profile, existingCompanyId: null as string | null };

  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return { supabase, user, profile, existingCompanyId: null as string | null };

  const rows = (data as { id: string }[] | null) ?? [];
  const existingCompanyId = rows[0]?.id ?? null;

  if (existingCompanyId) redirect(`/companies/${existingCompanyId}`);

  return { supabase, user, profile, existingCompanyId };
}
