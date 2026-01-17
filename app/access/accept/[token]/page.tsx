import AppShell from "@/app/components/AppShell";
import AcceptClient from "./AcceptClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function AcceptAccessPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <AppShell title="Invitation" subtitle="Accepter ou refuser l’invitation">
      <AcceptClient token={token} />
    </AppShell>
  );
}
