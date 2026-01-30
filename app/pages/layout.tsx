import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import type { ReactNode } from "react";

// Next.js 15 / Vercel: ce layout lit les cookies (Supabase auth), donc il doit être dynamique.
export const dynamic = "force-dynamic";

export default async function PagesLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Si votre AppShell a besoin du user (optionnel selon votre implémentation)
  const { data: me } = await supabase
    .from("app_users")
    .select("id, email, full_name, account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  // ✅ Si votre AppShell accepte "me" :
  // return <AppShell accountType="profil" me={me}>{children}</AppShell>;

  // ✅ Sinon, AppShell lit déjà le workspace en interne :
  return <AppShell accountType="profil">{children}</AppShell>;
}
