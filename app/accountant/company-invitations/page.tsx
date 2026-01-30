import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CabinetCompanyInvitationsClient from "./CabinetCompanyInvitationsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AccountantCompanyInvitationsPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  // Cabinet actif (workspace)
  const { data: ws } = await supabase
    .from("user_workspace")
    .select("active_group_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const cabinetGroupId = ws?.active_group_id ?? null;
  if (!cabinetGroupId) redirect("/switch");

  // Nom du cabinet
  const { data: g } = await supabase
    .from("groups")
    .select("id, group_name, group_type")
    .eq("id", cabinetGroupId)
    .maybeSingle();

  // Sécurité : si ce n’est pas un cabinet -> switch
  if (!g?.id || String(g.group_type ?? "") !== "cabinet") redirect("/switch");

  const cabinetName = g.group_name ?? "Cabinet";

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-5">
        <div className="text-xl font-semibold">Invitations reçues (Sociétés)</div>
        <div className="text-sm opacity-80">Cabinet : {cabinetName}</div>
      </div>

      <CabinetCompanyInvitationsClient
        cabinetGroupId={cabinetGroupId}
        cabinetName={cabinetName}
      />
    </div>
  );
}
