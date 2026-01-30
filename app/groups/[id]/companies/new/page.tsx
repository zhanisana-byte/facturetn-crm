// app/groups/[id]/companies/new/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GroupInternalCompanyCreateClient from "./GroupInternalCompanyCreateClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function GroupInternalCompanyNewPage({
  params,
}: {
  params?: Promise<{ id: string }>;
}) {
  const p = (await params) ?? ({} as any);
  const groupId = String((p as any).id ?? "");
  if (!groupId) redirect("/groups");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // ✅ IMPORTANT: PAS de <AppShell> ici.
  // Le sidebar + AppShell sont déjà rendus par /app/groups/[id]/layout.tsx
  return (
    <div className="mx-auto w-full max-w-2xl p-6">
      <div className="ftn-card p-4 mb-4">
        <div className="text-xl font-semibold">Créer une société interne</div>
        <div className="text-sm opacity-70">Espace Groupe</div>
      </div>

      <GroupInternalCompanyCreateClient groupId={groupId} />
    </div>
  );
}
