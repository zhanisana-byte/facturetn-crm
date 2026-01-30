import AppShell from "@/app/components/AppShell";
import { getAuthUser } from "@/lib/auth/server";
import { ensureWorkspaceRow } from "@/lib/workspace/server";
import NewRecurringTemplateClient from "./NewRecurringTemplateClient";

export const dynamic = "force-dynamic";

export default async function NewRecurringTemplatePage() {
  const { supabase, user } = await getAuthUser();
  const ws = await ensureWorkspaceRow(supabase, user.id);
  const mode = ws?.active_mode ?? "profil";

  const { data: ms } = await supabase
    .from("memberships")
    .select("company_id, is_active, companies(id, company_name)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const companies = (ms ?? [])
    .map((m: any) => ({
      id: String(m.companies?.id ?? m.company_id ?? ""),
      name: String(m.companies?.company_name ?? "Société"),
    }))
    .filter((c: any) => Boolean(c.id));

  return (
    <AppShell title="Nouvelle facture permanente" subtitle="Génération automatique" accountType={mode as any}>
      <NewRecurringTemplateClient companies={companies} />
    </AppShell>
  );
}
