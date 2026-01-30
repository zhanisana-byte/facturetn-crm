"use client";

import GroupInvitationsProClient from "@/app/groups/[id]/invitations/GroupInvitationsProClient";

export default function CabinetInvitationsProClient({
  cabinetGroupId,
  canInvite,
}: {
  cabinetGroupId: string;
  canInvite: boolean;
}) {
  return (
    <GroupInvitationsProClient
      groupId={cabinetGroupId}
      canInvite={canInvite}
    />
  );
}
