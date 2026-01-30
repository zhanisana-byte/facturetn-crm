import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspaceRow } from "@/lib/workspace/server";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CompaniesLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const ws = await ensureWorkspaceRow(supabase, auth.user.id);

  /**
   * ✅ IMPORTANT
   * On force "entreprise" UNIQUEMENT si une société est active.
   * Sinon (ex: /companies/create), on laisse le mode "profil"
   * pour garder la sidebar Profil visible.
   */
  const hasActiveCompany = !!ws?.active_company_id;

  // PERF: éviter d'écrire en DB à chaque requête
  if (hasActiveCompany && (ws?.active_mode ?? "profil") !== "entreprise") {
    await supabase
      .from("user_workspace")
      .update({
        active_mode: "entreprise",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", auth.user.id);
  }

  return <>{children}</>;
}
