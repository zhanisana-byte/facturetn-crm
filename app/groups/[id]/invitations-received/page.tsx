import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GroupCompanyInvitationsReceivedClient from "./GroupCompanyInvitationsReceivedClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Props = { params: Promise<{ id: string }> };

export default async function GroupInvitationsReceivedPage({ params }: Props) {
  const { id: groupId } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");
  const userId = auth.user.id;

  const { data: group } = await supabase
    .from("groups")
    .select("id,owner_user_id,group_name")
    .eq("id", groupId)
    .maybeSingle();

  if (!group?.id) redirect("/groups/select");

  const isOwner = group.owner_user_id === userId;
  if (!isOwner) {
    const { data: gm } = await supabase
      .from("group_members")
      .select("role,is_active")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle();
    const isAdmin = !!gm?.is_active && String(gm.role) === "admin";
    if (!isAdmin) redirect(`/groups/${groupId}`);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="ftn-card-lux p-5">
        <div className="text-xl font-semibold">Invitations reçues — Sociétés</div>
        <div className="text-sm opacity-80">
          Ici, vous recevez les invitations des sociétés gérées pour être gérées dans votre groupe.
        </div>
      </div>

      <GroupCompanyInvitationsReceivedClient groupId={groupId} groupName={group.group_name ?? "Groupe"} />
    </div>
  );
}
