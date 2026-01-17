import AppShell from "@/app/components/AppShell";
import AcceptClient from "./AcceptClient";

export const dynamic = "force-dynamic";

export default async function AcceptAccessPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AppShell
      title="Invitation"
      subtitle="Accepter ou refuser l’invitation"
      accountType="profil"
    >
      <AcceptClient token={token} />
    </AppShell>
  );
}
