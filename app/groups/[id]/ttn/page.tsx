import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("app_users")
    .select("id,account_type")
    .eq("id", auth.user.id)
    .single();

  return (
    <AppShell title="TTN & erreurs" subtitle="Vue globale TTN sur toutes les sociétés du groupe" accountType={profile?.account_type}>
      <Card title="TTN & erreurs" subtitle="Vue globale TTN sur toutes les sociétés du groupe">
        <div className="ftn-muted">Vue recommandée: erreurs TTN, en attente, OK + export.</div>
        <div className="mt-4">
          <Link className="ftn-link" href={`/groups/${id}`}>← Retour au groupe</Link>
        </div>
      </Card>
    </AppShell>
  );
}