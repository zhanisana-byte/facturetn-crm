import { redirect } from "next/navigation";
import AppShell from "@/app/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import AcceptClient from "./AcceptClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function AcceptInvitationPage({ params }: PageProps) {
  const { token } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  return (
    <AppShell title="Invitation" subtitle="Accepter ou refuser l’invitation">
      <AcceptClient token={token} />
    </AppShell>
  );
}
