import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/app/components/AppShell";
import { Card } from "@/components/ui";

type PageProps = { params: Promise<{ id: string }> };
export default async function Page({ params }: PageProps) {
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
    <AppShell title="Équipe du groupe" subtitle="Membres internes + permissions (par tâche)" accountType={profile?.account_type}>
      <Card title="Équipe du groupe" subtitle="Membres internes + permissions (par tâche)">
        <div className="ftn-muted">UI prête à brancher sur tes tables (group_members + permissions).</div>
        <div className="mt-4">
          <Link className="ftn-link" href={`/groups/${id}`}>← Retour au groupe</Link>
        </div>
      </Card>
    </AppShell>
  );
}
