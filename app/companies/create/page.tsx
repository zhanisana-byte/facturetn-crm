import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import CreateCompanyClient from "./CreateCompanyClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CreateCompanyPage() {
  const supabase = await createClient();
  const { data: s } = await supabase.auth.getSession();
  const user = s.session?.user;
  if (!user) redirect("/login");

  // ✅ IMPORTANT: création société depuis Profil => sidebar Profil (pas “entreprise”)
  return (
    <AppShell title="Créer une société" subtitle="Espace Profil" accountType="profil">
      <div className="mx-auto w-full max-w-xl p-6">
        <CreateCompanyClient />
      </div>
    </AppShell>
  );
}
