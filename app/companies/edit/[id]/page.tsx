import { redirect, notFound } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import EditCompanyClient from "./EditCompanyClient";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspaceRow, shellTypeFromWorkspace } from "@/lib/workspace/server";

export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditCompanyPage({ params }: PageProps) {
  const { id } = await params;

  if (!isUuid(id)) notFound();

  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  await ensureWorkspaceRow(supabase, auth.user.id);

  const { data: ws } = await supabase
    .from("user_workspace")
    .select("active_mode, active_company_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (ws?.active_mode !== "entreprise" || ws?.active_company_id !== id) {
    await supabase.from("user_workspace").upsert(
      {
        user_id: auth.user.id,
        active_mode: "entreprise",
        active_company_id: id,
        active_group_id: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  return (
    <AppShell
      title="Modifier la société"
      subtitle="Mettre à jour les informations de la société"
      accountType={shellTypeFromWorkspace("entreprise")}
      activeCompanyId={id}
    >
      <EditCompanyClient companyId={id} />
    </AppShell>
  );
}
