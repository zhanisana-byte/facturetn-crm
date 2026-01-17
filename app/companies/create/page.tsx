import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import CreateCompanyClient from "./CreateCompanyClient";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CreateCompanyPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // ⚠️ IMPORTANT : on ne force PAS active_company_id ici
  const ws = await ensureWorkspaceRow(supabase);
  const mode = ws?.active_mode ?? "profil";

  return (
    <AppShell
      title="Créer une société"
      subtitle="Nouvelle entreprise"
      accountType={shellTypeFromWorkspace(mode)}
    >
      <div className="mx-auto w-full max-w-xl p-6">
        <CreateCompanyClient />
      </div>
    </AppShell>
  );
}
