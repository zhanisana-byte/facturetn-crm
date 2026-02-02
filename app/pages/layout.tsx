import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function PagesLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: me } = await supabase
    .from("app_users")
    .select("id, email, full_name, account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  return <AppShell accountType="profil">{children}</AppShell>;
}
