import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GroupDashboard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase);
  const activeMode = ws?.active_mode ?? "profil";

  return (
    <AppShell title="Mon Groupe" subtitle="Dashboard Groupe" accountType={shellTypeFromWorkspace(activeMode)}>
      <div className="mx-auto w-full max-w-6xl p-6">
        <h2 className="text-xl font-semibold">Dashboard Groupe</h2>
        <p className="text-slate-600 mt-2">Résumé pack, sociétés internes & externes.</p>
      </div>
    </AppShell>
  );
}
