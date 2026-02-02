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

  const hasActiveCompany = !!ws?.active_company_id;

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
