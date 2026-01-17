import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";

export default async function PagesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Si ton AppShell a besoin du user (optionnel selon ton implémentation)
  const { data: me } = await supabase
    .from("app_users")
    .select("id, email, full_name, account_type")
    .eq("id", auth.user.id)
    .maybeSingle();

  // ✅ Si ton AppShell accepte "me" :
  // return <AppShell accountType="profil" me={me}>{children}</AppShell>;

  // ✅ Sinon, AppShell lit déjà le workspace en interne :
  return <AppShell accountType="profil">{children}</AppShell>;
}
